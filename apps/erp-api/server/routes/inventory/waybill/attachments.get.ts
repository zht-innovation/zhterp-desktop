import { InventoryHttpError, toText } from "~~/server/services/inventory";
import {
    createZipBuffer,
    readInventoryPublicFiles,
    streamInventoryPublicFile,
} from "~~/server/services/inventoryFile";
import { useInventoryWaybillModel } from "~~/server/models/inventoryWaybill.model";
import { logger } from "~~/server/utils/logger";
import { assertInventoryWaybillFullReadAccess } from "~~/server/services/inventoryWaybillAccess";

export default defineEventHandler(async (event) => {
    try {
        await assertInventoryWaybillFullReadAccess(event.context.auth);
        const query = getQuery(event);
        const id = toText(query.id);
        const waybill = await useInventoryWaybillModel().detail(id);

        if (!waybill) {
            setResponseStatus(event, 404);
            return {
                code: CODE.INVENTORY_NOT_FOUND,
                msg: codeToMsg[CODE.INVENTORY_NOT_FOUND],
            };
        }

        const attachments = Array.isArray(waybill.attachments) ? waybill.attachments : [];
        if (!attachments.length) {
            throw new InventoryHttpError(404, CODE.INVENTORY_NOT_FOUND, "当前运单没有附件");
        }

        if (attachments.length === 1) {
            const stream = streamInventoryPublicFile(event, attachments[0]);
            if (!stream) {
                throw new InventoryHttpError(404, CODE.INVENTORY_NOT_FOUND, "附件文件不存在");
            }

            return sendStream(event, stream);
        }

        const files = readInventoryPublicFiles(attachments);
        if (!files.length) {
            throw new InventoryHttpError(404, CODE.INVENTORY_NOT_FOUND, "附件文件不存在");
        }

        const zipBuffer = createZipBuffer(files);
        const filename = `${waybill.waybillNo || "waybill"}-附件.zip`;

        setHeader(event, "Content-Type", "application/zip");
        setHeader(event, "Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);

        return zipBuffer;
    } catch (err: any) {
        logger.error("Download inventory waybill attachments error", err);
        const knownError = err instanceof InventoryHttpError;
        setResponseStatus(event, knownError ? err.status : 500);
        return {
            code: knownError ? err.code : CODE.SERVER_ERROR,
            msg: knownError ? err.message : codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
