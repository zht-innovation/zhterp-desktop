import { useContactModel } from "~~/server/models/contact.model"
import { useCustomerModel } from "~~/server/models/customer.model"
import { useNewsModel } from "~~/server/models/news.model"
import { useSalespersonModel } from "~~/server/models/salesperson.model"
import { logger } from "~~/server/utils/logger"

export default defineEventHandler(async (event) => {
    const contactModel = useContactModel()
    const body = await readBody(event)
    const id = body.id
    logger.info(`body: ${body}`)
    try {
        const contact = await contactModel.contact
            .findById(id)
            .select('conCustomerId conSalespersonId')
            .lean()

        if (contact?.conSalespersonId && contact?.conCustomerId) {
            const customerModel = useCustomerModel()
            const salespersonModel = useSalespersonModel()
            const newsModel = useNewsModel()
            const auth = event.context.auth
            const actorName = auth?.nickname || auth?.username || '管理员'

            const [customer, salesperson] = await Promise.all([
                customerModel.customer.findById(contact.conCustomerId).select('name'),
                salespersonModel.salesperson
                    .findById(contact.conSalespersonId)
                    .select('name nameCn'),
            ])

            await newsModel.add({
                scope: 'personal',
                type: 'maintenance_ended',
                recipientSalespersonId: contact.conSalespersonId,
                actorName,
                customerId: contact.conCustomerId,
                customerName: customer?.name || '',
                salespersonId: contact.conSalespersonId,
                salespersonName: salesperson?.nameCn || salesperson?.name || '',
                eventKey: `maintenance_ended:${id}`,
            })
        }
    } catch (newsErr) {
        logger.error('Add maintenance ended news failed', newsErr as Error)
    }

    await contactModel.remove(id)

    setResponseStatus(event, 200)
    return {
        code: CODE.SUCCESS,
        msg: codeToMsg[CODE.SUCCESS]
    }
})
