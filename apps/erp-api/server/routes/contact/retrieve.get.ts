import { ContactReq, useContactModel } from "~~/server/models/contact.model"
import { logger } from "~~/server/utils/logger"

export default defineEventHandler(async (event) => {
    try {
        const user = event.context.auth;
        const userRole = user.role

        const body = await readBody(event)
        const id = body.id

        const contact = useContactModel()
        const contactList = await contact.retrieveContactList(id, userRole)
        setResponseStatus(event, 200)
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: {
                contacts: contactList
            }
        }
    } catch (err: any) {
        logger.error(`Failed to retrieve contact list`, err as Error)
        setResponseStatus(event, 613)
        return {
            code: CODE.SERVER_ERROR,
            msg: codeToMsg[CODE.SERVER_ERROR]
        }
    }
})