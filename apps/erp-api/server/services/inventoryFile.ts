import { getErpAttachmentRoot } from "~~/server/utils/erpAttachmentRoot";
import { createReadStream, createWriteStream } from "fs";
import fs from "fs";
import path from "path";

export type InventorySavedFile = {
    name: string;
    url: string;
    size: number;
    type: string;
};

type ZipFile = {
    name: string;
    data: Buffer;
};

export const getInventoryUploadDir = (resource: string) => {
    return path.join(getErpAttachmentRoot(), "main", "inventory", resource);
};

export const getInventoryPublicPath = (resource: string, filename: string) => {
    return `/main/inventory/${resource}/${filename}`;
};

const sanitizeFilename = (filename: string) => {
    return path.basename(filename || "file").replace(/[^\w.\-\u4e00-\u9fa5]/g, "_");
};

export const saveInventoryFile = async (filePart: any, resource: string): Promise<InventorySavedFile> => {
    const uploadDir = getInventoryUploadDir(resource);
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }

    const originalName = sanitizeFilename(filePart.filename || "file");
    const ext = path.extname(originalName);
    const baseName = path.basename(originalName, ext);
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${baseName}${ext}`;
    const filepath = path.join(uploadDir, filename);

    const writeStream = createWriteStream(filepath);
    writeStream.write(filePart.data);
    writeStream.end();

    await new Promise((resolve, reject) => {
        writeStream.on("finish", resolve);
        writeStream.on("error", reject);
    });

    return {
        name: originalName,
        url: getInventoryPublicPath(resource, filename),
        size: Number(filePart.data?.length || 0),
        type: filePart.type || "",
    };
};

export const resolvePublicFilePath = (publicPath: string) => {
    const normalized = publicPath.replace(/^\/+/, "").replace(/\//g, path.sep);
    const filePath = path.resolve(getErpAttachmentRoot(), normalized);
    const publicRoot = path.resolve(getErpAttachmentRoot());
    const relativePath = path.relative(publicRoot, filePath);

    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
        return "";
    }

    return filePath;
};

export const streamInventoryPublicFile = (event: any, file: InventorySavedFile) => {
    const filePath = resolvePublicFilePath(file.url);

    if (!filePath || !fs.existsSync(filePath)) {
        return null;
    }

    setHeader(event, "Content-Type", file.type || "application/octet-stream");
    setHeader(
        event,
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(file.name || path.basename(filePath))}`,
    );

    return createReadStream(filePath);
};

const crcTable = (() => {
    const table = new Uint32Array(256);

    for (let i = 0; i < table.length; i += 1) {
        let current = i;

        for (let bit = 0; bit < 8; bit += 1) {
            current = current & 1 ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
        }

        table[i] = current >>> 0;
    }

    return table;
})();

const getCrc32 = (data: Buffer) => {
    let crc = 0xffffffff;

    data.forEach((byte) => {
        crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    });

    return (crc ^ 0xffffffff) >>> 0;
};

const getZipDateTime = (date = new Date()) => ({
    date: ((Math.max(date.getFullYear(), 1980) - 1980) << 9)
        | ((date.getMonth() + 1) << 5)
        | date.getDate(),
    time: (date.getHours() << 11)
        | (date.getMinutes() << 5)
        | Math.floor(date.getSeconds() / 2),
});

const getUniqueFileName = (filename: string, usedNames: Set<string>) => {
    const fallbackName = sanitizeFilename(filename || "附件");

    if (!usedNames.has(fallbackName)) {
        usedNames.add(fallbackName);
        return fallbackName;
    }

    const extensionIndex = fallbackName.lastIndexOf(".");
    const name = extensionIndex > 0 ? fallbackName.slice(0, extensionIndex) : fallbackName;
    const extension = extensionIndex > 0 ? fallbackName.slice(extensionIndex) : "";
    let index = 2;
    let nextName = `${name}-${index}${extension}`;

    while (usedNames.has(nextName)) {
        index += 1;
        nextName = `${name}-${index}${extension}`;
    }

    usedNames.add(nextName);
    return nextName;
};

export const createZipBuffer = (files: ZipFile[]) => {
    const localParts: Buffer[] = [];
    const centralParts: Buffer[] = [];
    const usedNames = new Set<string>();
    let offset = 0;
    let centralSize = 0;
    const { date, time } = getZipDateTime();

    files.forEach((file) => {
        const filename = getUniqueFileName(file.name, usedNames);
        const nameBytes = Buffer.from(filename, "utf-8");
        const crc = getCrc32(file.data);
        const localOffset = offset;
        const localHeader = Buffer.alloc(30);

        localHeader.writeUInt32LE(0x04034b50, 0);
        localHeader.writeUInt16LE(20, 4);
        localHeader.writeUInt16LE(0x0800, 6);
        localHeader.writeUInt16LE(0, 8);
        localHeader.writeUInt16LE(time, 10);
        localHeader.writeUInt16LE(date, 12);
        localHeader.writeUInt32LE(crc, 14);
        localHeader.writeUInt32LE(file.data.byteLength, 18);
        localHeader.writeUInt32LE(file.data.byteLength, 22);
        localHeader.writeUInt16LE(nameBytes.byteLength, 26);
        localHeader.writeUInt16LE(0, 28);

        localParts.push(localHeader, nameBytes, file.data);
        offset += localHeader.byteLength + nameBytes.byteLength + file.data.byteLength;

        const centralHeader = Buffer.alloc(46);

        centralHeader.writeUInt32LE(0x02014b50, 0);
        centralHeader.writeUInt16LE(20, 4);
        centralHeader.writeUInt16LE(20, 6);
        centralHeader.writeUInt16LE(0x0800, 8);
        centralHeader.writeUInt16LE(0, 10);
        centralHeader.writeUInt16LE(time, 12);
        centralHeader.writeUInt16LE(date, 14);
        centralHeader.writeUInt32LE(crc, 16);
        centralHeader.writeUInt32LE(file.data.byteLength, 20);
        centralHeader.writeUInt32LE(file.data.byteLength, 24);
        centralHeader.writeUInt16LE(nameBytes.byteLength, 28);
        centralHeader.writeUInt16LE(0, 30);
        centralHeader.writeUInt16LE(0, 32);
        centralHeader.writeUInt16LE(0, 34);
        centralHeader.writeUInt16LE(0, 36);
        centralHeader.writeUInt32LE(0, 38);
        centralHeader.writeUInt32LE(localOffset, 42);

        centralParts.push(centralHeader, nameBytes);
        centralSize += centralHeader.byteLength + nameBytes.byteLength;
    });

    const endHeader = Buffer.alloc(22);

    endHeader.writeUInt32LE(0x06054b50, 0);
    endHeader.writeUInt16LE(0, 4);
    endHeader.writeUInt16LE(0, 6);
    endHeader.writeUInt16LE(files.length, 8);
    endHeader.writeUInt16LE(files.length, 10);
    endHeader.writeUInt32LE(centralSize, 12);
    endHeader.writeUInt32LE(offset, 16);
    endHeader.writeUInt16LE(0, 20);

    return Buffer.concat([...localParts, ...centralParts, endHeader]);
};

export const readInventoryPublicFiles = (files: InventorySavedFile[]) => {
    return files
        .map((file) => {
            const filePath = resolvePublicFilePath(file.url);
            if (!filePath || !fs.existsSync(filePath)) {
                return null;
            }

            return {
                name: file.name || path.basename(filePath),
                data: fs.readFileSync(filePath),
            };
        })
        .filter(Boolean) as ZipFile[];
};
