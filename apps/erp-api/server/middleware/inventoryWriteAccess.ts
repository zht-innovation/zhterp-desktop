import { assertInventoryWriteAccess, InventoryHttpError } from "~~/server/services/inventory";

export default defineEventHandler((event) => {
    try {
        assertInventoryWriteAccess(event);
    } catch (error) {
        if (!(error instanceof InventoryHttpError)) {
            throw error;
        }

        throw createError({
            statusCode: error.status,
            statusMessage: error.message,
            data: {
                code: error.status,
                msg: error.message,
                data: null,
            },
        });
    }
});
