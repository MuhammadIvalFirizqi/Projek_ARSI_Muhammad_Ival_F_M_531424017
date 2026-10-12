/**
 * Klien API ringan: JSON, kirim identitas klien untuk penanda siapa yang berubah,
 * dan ambil cookie XSRF (aman meski route API stateless).
 */

export const clientId = (() => {
    const existing = sessionStorage.getItem('gantt_client_id');
    if (existing) return existing;
    const value = `client-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem('gantt_client_id', value);
    return value;
})();

export const displayName = {
    get: () => sessionStorage.getItem('gantt_display_name') || '',
    set: (value) => sessionStorage.setItem('gantt_display_name', value),
};

export const displayColor = {
    get: () => sessionStorage.getItem('gantt_display_color') || '#3b82f6',
    set: (value) => sessionStorage.setItem('gantt_display_color', value),
};

function xsrfToken() {
    const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : '';
}

export class ApiError extends Error {
    constructor(message, status, payload) {
        super(message);
        this.status = status;
        this.payload = payload;
    }
}

export async function request(method, url, body = undefined) {
    const headers = {
        Accept: 'application/json',
        'X-Client-Id': clientId,
        'X-Requested-With': 'XMLHttpRequest',
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const token = xsrfToken();
    if (token) headers['X-XSRF-TOKEN'] = token;

    let response;
    try {
        response = await fetch(url, {
            method,
            headers,
            credentials: 'same-origin',
            body: body === undefined ? undefined : JSON.stringify(body),
        });
    } catch (error) {
        throw new ApiError('Tidak dapat terhubung ke server', 0, null);
    }

    const text = await response.text();
    let payload = null;
    try {
        payload = text ? JSON.parse(text) : null;
    } catch (error) {
        payload = null;
    }

    if (!response.ok) {
        const message = payload?.message
            || payload?.errors && Object.values(payload.errors).flat().join('\n')
            || `Permintaan gagal (${response.status})`;
        throw new ApiError(message, response.status, payload);
    }

    return payload;
}

export const api = {
    get: (url) => request('GET', url),
    post: (url, body) => request('POST', url, body ?? {}),
    put: (url, body) => request('PUT', url, body ?? {}),
    delete: (url) => request('DELETE', url),
};
