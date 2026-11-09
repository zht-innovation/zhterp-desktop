import { getToken } from '~/utils/auth'

export type ApplicationPayload = {
    appCustomerId: string
    appSalespersonId: string
    appDays: number
}

export function applyContact() {
    return (payload: ApplicationPayload) =>
        $fetch('/application/add', {
            method: 'POST',
            headers: {
                Token: getToken() || '',
            },
            body: payload,
        })
}

export function retrieveApplicationList() {
    return () =>
        $fetch('/application/retrieve', {
            method: 'GET',
            headers: {
                Token: getToken() || '',
            },
        })
}

export function handleApplication() {
    return (payload: { _id: string; agreed: boolean }) =>
        $fetch('/application/handle', {
            method: 'PUT',
            headers: {
                Token: getToken() || '',
            },
            body: payload,
        })
}

export function revokeApplication() {
    return (_id: string) =>
        $fetch('/application/revoke', {
            method: 'DELETE',
            headers: {
                Token: getToken() || '',
            },
            body: { _id },
        })
}
