/**
 * 极简 ZIP 读写（只够 APK 打包用）
 *
 * 为什么不用现成工具：
 *   - `aapt2 link -A` 在 Windows 上写入的条目名用的是平台分隔符（反斜杠），
 *     结果是 APK 里存成 `assets\www\index.html`，Android 的 AssetManager 按
 *     `assets/www/index.html` 查找，直接 ERR_FILE_NOT_FOUND。
 *   - `aapt add` 会把传给它的路径原样当条目名（传绝对路径就把绝对路径写进去）。
 *   - Python 的 zipfile 在 Windows 上会把读取到的 `\` 规范化成 `/`，
 *     所以用 Python 校验会被骗过（真的踩过）。
 * 结论：条目名这件事自己写、自己校验最稳。
 *
 * 这里的 appendEntries 只做"往已有 zip 末尾追加条目"：
 * 原有的 local entry 字节全部原样保留（因此 resources.arsc 的 stored 状态和
 * 偏移都不会被破坏），只在中央目录前面插入新的 local entry，然后重写中央目录。
 */

'use strict';

var zlib = require('zlib');

/* ----------------------------- CRC32 ----------------------------- */

var crcTable = (function () {
	var table = new Int32Array(256);
	for (var n = 0; n < 256; n++) {
		var c = n;
		for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[n] = c;
	}
	return table;
})();

function crc32(buf) {
	var c = 0xffffffff;
	for (var i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

/* --------------------------- 读取条目 --------------------------- */

var EOCD_SIG = 0x06054b50;
var CD_SIG = 0x02014b50;
var LOCAL_SIG = 0x04034b50;

/** 找到 End of Central Directory 的偏移 */
function findEocd(buf) {
	for (var i = buf.length - 22; i >= 0 && i > buf.length - 65557; i--) {
		if (buf.readUInt32LE(i) === EOCD_SIG) return i;
	}
	return -1;
}

/**
 * 解析中央目录，返回**未经任何规范化**的条目名
 * @returns {{entries:Array, cdOffset:Number, cdSize:Number, eocd:Number}}
 */
function readEntries(buf) {
	var eocd = findEocd(buf);
	if (eocd < 0) throw new Error('不是合法的 ZIP：找不到 EOCD');

	var total = buf.readUInt16LE(eocd + 10);
	var cdSize = buf.readUInt32LE(eocd + 12);
	var cdOffset = buf.readUInt32LE(eocd + 16);

	if (buf.readUInt16LE(eocd + 4) !== 0 || buf.readUInt16LE(eocd + 6) !== 0) {
		throw new Error('不支持分卷 ZIP');
	}
	if (cdOffset === 0xffffffff || total === 0xffff) {
		throw new Error('暂不支持 ZIP64');
	}

	var entries = [];
	var off = cdOffset;
	for (var i = 0; i < total; i++) {
		if (buf.readUInt32LE(off) !== CD_SIG) throw new Error('中央目录签名异常 @' + off);
		var nameLen = buf.readUInt16LE(off + 28);
		var extraLen = buf.readUInt16LE(off + 30);
		var commentLen = buf.readUInt16LE(off + 32);
		var rawLen = 46 + nameLen + extraLen + commentLen;
		entries.push({
			name: buf.toString('utf8', off + 46, off + 46 + nameLen),
			method: buf.readUInt16LE(off + 10),
			compSize: buf.readUInt32LE(off + 20),
			uncompSize: buf.readUInt32LE(off + 24),
			localOffset: buf.readUInt32LE(off + 42),
			raw: buf.slice(off, off + rawLen)
		});
		off += rawLen;
	}

	return { entries: entries, cdOffset: cdOffset, cdSize: cdSize, eocd: eocd };
}

/* --------------------------- 追加条目 --------------------------- */

/** DOS 时间/日期：固定成 2026-01-01 00:00:00，保证构建可复现 */
function dosDateTime() {
	return { time: 0, date: ((2026 - 1980) << 9) | (1 << 5) | 1 };
}

/**
 * 往已有 zip 追加条目
 * @param {Buffer} buf 原 zip
 * @param {Array<{name:String, data:Buffer, store:Boolean}>} files
 *        name 必须自己保证用正斜杠；store=true 表示不压缩
 * @returns {Buffer} 新的 zip
 */
function appendEntries(buf, files) {
	var info = readEntries(buf);
	var dt = dosDateTime();

	var localParts = [];
	var newCdRecords = [];
	var added = 0;
	var offset = info.cdOffset; // 新条目的 local header 从这里开始

	files.forEach(function (f) {
		if (typeof f.name !== 'string' || f.name.indexOf('\\') !== -1) {
			throw new Error('条目名必须是正斜杠路径: ' + f.name);
		}
		var nameBuf = Buffer.from(f.name, 'utf8');
		var crc = crc32(f.data);
		var method;
		var payload;
		if (f.store) {
			method = 0;
			payload = f.data;
		} else {
			method = 8;
			payload = zlib.deflateRawSync(f.data, { level: 9 });
			// 压缩后反而变大的话就直接存
			if (payload.length >= f.data.length) {
				method = 0;
				payload = f.data;
			}
		}

		var local = Buffer.alloc(30);
		local.writeUInt32LE(LOCAL_SIG, 0);
		local.writeUInt16LE(20, 4);          // version needed
		local.writeUInt16LE(0x0800, 6);      // flags: UTF-8
		local.writeUInt16LE(method, 8);
		local.writeUInt16LE(dt.time, 10);
		local.writeUInt16LE(dt.date, 12);
		local.writeUInt32LE(crc, 14);
		local.writeUInt32LE(payload.length, 18);
		local.writeUInt32LE(f.data.length, 22);
		local.writeUInt16LE(nameBuf.length, 26);
		local.writeUInt16LE(0, 28);

		localParts.push(local, nameBuf, payload);

		var cd = Buffer.alloc(46);
		cd.writeUInt32LE(CD_SIG, 0);
		cd.writeUInt16LE(20, 4);             // version made by
		cd.writeUInt16LE(20, 6);             // version needed
		cd.writeUInt16LE(0x0800, 8);
		cd.writeUInt16LE(method, 10);
		cd.writeUInt16LE(dt.time, 12);
		cd.writeUInt16LE(dt.date, 14);
		cd.writeUInt32LE(crc, 16);
		cd.writeUInt32LE(payload.length, 20);
		cd.writeUInt32LE(f.data.length, 24);
		cd.writeUInt16LE(nameBuf.length, 28);
		cd.writeUInt16LE(0, 30);             // extra
		cd.writeUInt16LE(0, 32);             // comment
		cd.writeUInt16LE(0, 34);             // disk
		cd.writeUInt16LE(0, 36);             // internal attrs
		cd.writeUInt32LE(0, 38);             // external attrs
		cd.writeUInt32LE(offset, 42);        // local header offset
		newCdRecords.push(cd, nameBuf);

		offset += 30 + nameBuf.length + payload.length;
		added++;
	});

	var existingCd = info.entries.map(function (e) { return e.raw; });
	var cd = Buffer.concat(existingCd.concat(newCdRecords));
	var totalEntries = info.entries.length + added;

	var newCdOffset = info.cdOffset + localParts.reduce(function (s, b) { return s + b.length; }, 0);

	var eocd = Buffer.alloc(22);
	eocd.writeUInt32LE(EOCD_SIG, 0);
	eocd.writeUInt16LE(0, 4);
	eocd.writeUInt16LE(0, 6);
	eocd.writeUInt16LE(totalEntries, 8);
	eocd.writeUInt16LE(totalEntries, 10);
	eocd.writeUInt32LE(cd.length, 12);
	eocd.writeUInt32LE(newCdOffset, 16);
	eocd.writeUInt16LE(0, 20);

	return Buffer.concat([
		buf.slice(0, info.cdOffset),   // 原有 local entries + 数据，原样保留
		Buffer.concat(localParts),     // 新条目
		cd,                            // 中央目录（旧的记录原样拷贝 + 新记录）
		eocd
	]);
}

/**
 * 取出某个条目的原始内容（解压后）
 * @param {Buffer} buf zip
 * @param {String} name 精确条目名（区分大小写，必须用正斜杠）
 * @returns {Buffer|null}
 */
function readEntry(buf, name) {
	var info = readEntries(buf);
	var entry = null;
	for (var i = 0; i < info.entries.length; i++) {
		if (info.entries[i].name === name) { entry = info.entries[i]; break; }
	}
	if (!entry) return null;

	var off = entry.localOffset;
	if (buf.readUInt32LE(off) !== LOCAL_SIG) throw new Error('local header 签名异常: ' + name);
	var nameLen = buf.readUInt16LE(off + 26);
	var extraLen = buf.readUInt16LE(off + 28);
	var dataStart = off + 30 + nameLen + extraLen;
	var raw = buf.slice(dataStart, dataStart + entry.compSize);

	if (entry.method === 0) return raw;
	if (entry.method === 8) return zlib.inflateRawSync(raw);
	throw new Error('不支持的压缩方式 ' + entry.method + ' (' + name + ')');
}

module.exports = {
	crc32: crc32,
	readEntries: readEntries,
	readEntry: readEntry,
	appendEntries: appendEntries
};
