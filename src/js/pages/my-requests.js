import { apiRequest } from "../auth/auth.js";

const body = document.getElementById("myRequestsTableBody");
const feedback = document.getElementById("myRequestsFeedback");

function show(message, type = "danger") {
    feedback.textContent = message;
    feedback.className = `alert alert-${type}`;
}

function cell(text) {
    const td = document.createElement("td");
    td.textContent = text;
    return td;
}

function badge(status) {
    const span = document.createElement("span");
    const classes = {
        "Solicitado": "text-bg-warning",
        "En proceso": "text-bg-primary",
        "Finalizado": "text-bg-success"
    };
    span.className = `badge ${classes[status] ?? "text-bg-secondary"}`;
    span.textContent = status;
    return span;
}

function button(text, className, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = className;
    b.textContent = text;
    b.addEventListener("click", onClick);
    return b;
}

async function editQuantity(request) {
    const input = window.prompt(`Nueva cantidad para "${request.service_name}" (1-99):`, request.quantity);
    if (input === null) return;

    const quantity = Number(input);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
        show("La cantidad debe ser un número entero entre 1 y 99.");
        return;
    }

    try {
        await apiRequest(`/requests/${request.id}`, { method: "PUT", body: { quantity } });
        show("Cantidad actualizada.", "success");
        await load();
    } catch (error) {
        show(error.message);
    }
}

async function remove(request) {
    if (!window.confirm(`¿Borrar la solicitud de "${request.service_name}"?`)) return;

    try {
        await apiRequest(`/requests/${request.id}`, { method: "DELETE" });
        show("Solicitud eliminada.", "success");
        await load();
    } catch (error) {
        show(error.message);
    }
}

function render(requests) {
    body.replaceChildren();

    if (requests.length === 0) {
        const row = document.createElement("tr");
        const td = cell("Todavía no tienes solicitudes.");
        td.colSpan = 6;
        td.className = "text-center text-muted py-4";
        row.appendChild(td);
        body.appendChild(row);
        return;
    }

    for (const request of requests) {
        const row = document.createElement("tr");

        const statusCell = document.createElement("td");
        statusCell.appendChild(badge(request.status));

        const actions = document.createElement("td");
        actions.className = "text-end";

        if (request.status === "Solicitado") {
            const group = document.createElement("div");
            group.className = "d-flex justify-content-end gap-2";
            group.append(
                button("Modificar", "btn btn-sm btn-outline-primary", () => editQuantity(request)),
                button("Borrar", "btn btn-sm btn-outline-danger", () => remove(request))
            );
            actions.appendChild(group);
        } else {
            actions.textContent = "No editable";
            actions.classList.add("text-muted");
        }

        row.append(
            cell(request.service_name),
            cell(request.quantity),
            cell(request.event_date
                ? new Date(request.event_date).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })
                : "—"),
            cell(new Date(request.created_at).toLocaleDateString("es-MX", {
                day: "2-digit", month: "short", year: "numeric"
            })),
            statusCell,
            actions
        );

        body.appendChild(row);
    }
}

async function load() {
    try {
        const response = await apiRequest("/requests/me");
        render(response.requests ?? []);
    } catch (error) {
        show("No se pudieron cargar tus solicitudes.");
    }
}

load();