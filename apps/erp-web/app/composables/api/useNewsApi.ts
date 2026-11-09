import { getToken } from '~/utils/auth'

export function retrieveNewsList() {
    return () =>
        $fetch('/news/retrieve', {
            method: 'GET',
            headers: {
                Token: getToken() || '',
            },
        })
}
