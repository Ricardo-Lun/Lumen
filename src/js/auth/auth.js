const API_BASE_URL = "http://localhost:3000/api";

export async function apiRequest(endpoint, options = {}) {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            ...options.headers
        }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        const error = new Error(
            data.message ?? "Ocurrió un error al comunicarse con el servidor."
        );

        error.status = response.status;
        error.data = data;

        throw error;
    }

    return data;
}

export async function login(username, password) {
    const data = await apiRequest("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password })
    });

    return data.user;
}

export async function logout() {
    return apiRequest("/auth/logout", {
        method: "POST"
    });
}

export async function getCurrentUser() {
    return apiRequest("/auth/me");
}

