import { apiRequest, getCurrentUser } from "../auth/auth.js";

const grid = document.getElementById("servicesGrid");
const requestBar = document.getElementById("requestBar");
const requestBarText = document.getElementById("requestBarText");
const requestButton = document.getElementById("requestButton");
const requestFeedback = document.getElementById("requestFeedback");

const requestModalElement = document.getElementById("requestModal");
const requestForm = document.getElementById("requestForm");
const requestEventDate = document.getElementById("requestEventDate");
const requestMessage = document.getElementById("requestMessage");
const requestModalFeedback = document.getElementById("requestModalFeedback");
const confirmRequestButton = document.getElementById("confirmRequestButton");

// La fecha mínima es hoy (en hora local, no UTC).
const today = new Date();
requestEventDate.min = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0")
].join("-");

// service_id -> cantidad
const selection = new Map();

function normalizeFeatures(features) {
    if (Array.isArray(features)) return features;

    if (typeof features === "string") {
        try {
            const parsed = JSON.parse(features);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    return [];
}

function formatPrice(value) {
    if (value === null || value === undefined || value === "") {
        return "Precio por definir";
    }

    return new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "MXN"
    }).format(Number(value));
}

// Solo acepta clases tipo "bi-camera".
function safeIcon(icon) {
    return typeof icon === "string" && /^bi-[a-z0-9-]+$/.test(icon.trim())
        ? icon.trim()
        : "bi-stars";
}

function clampQuantity(value) {
    return Math.min(99, Math.max(1, Math.trunc(Number(value) || 1)));
}

function updateRequestBar() {
    const count = selection.size;

    requestBar.classList.toggle("d-none", count === 0);
    requestBarText.textContent =
        `${count} servicio${count === 1 ? "" : "s"} seleccionado${count === 1 ? "" : "s"}`;
}

function showRequestFeedback(message, type) {
    requestFeedback.textContent = message;
    requestFeedback.className = `alert alert-${type} container`;
}

function hideRequestFeedback() {
    requestFeedback.className = "d-none";
}

function createServiceCard(service) {
    const column = document.createElement("div");
    column.className = "col-md-6 col-lg-4";

    const article = document.createElement("article");
    article.className = "service-card";

    const iconBox = document.createElement("div");
    iconBox.className = "icon";

    const icon = document.createElement("i");
    icon.className = `bi ${safeIcon(service.icon)}`;
    iconBox.appendChild(icon);

    const title = document.createElement("h2");
    title.className = "h4";
    title.textContent = service.name;

    const description = document.createElement("p");
    description.className = "section-sub";
    description.textContent = service.description;

    const price = document.createElement("p");
    price.className = "fw-semibold mb-2";
    price.textContent = formatPrice(service.price);

    const list = document.createElement("ul");
    list.className = "small";

    for (const feature of normalizeFeatures(service.features)) {
        const item = document.createElement("li");
        item.textContent = feature;
        list.appendChild(item);
    }

    // Selección y cantidad
    const controls = document.createElement("div");
    controls.className = "d-flex align-items-center gap-3 mt-3";

    const label = document.createElement("label");
    label.className = "form-check-label d-flex align-items-center gap-2";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "form-check-input mt-0";
    checkbox.dataset.serviceId = service.id;

    label.append(checkbox, document.createTextNode("Seleccionar"));

    const quantity = document.createElement("input");
    quantity.type = "number";
    quantity.className = "form-control form-control-sm";
    quantity.style.width = "80px";
    quantity.min = "1";
    quantity.max = "99";
    quantity.value = "1";
    quantity.disabled = true;
    quantity.setAttribute("aria-label", `Cantidad de ${service.name}`);

    checkbox.addEventListener("change", () => {
        quantity.disabled = !checkbox.checked;

        if (checkbox.checked) {
            selection.set(service.id, clampQuantity(quantity.value));
        } else {
            selection.delete(service.id);
        }

        updateRequestBar();
    });

    quantity.addEventListener("input", () => {
        if (selection.has(service.id)) {
            selection.set(service.id, clampQuantity(quantity.value));
        }
    });

    controls.append(label, quantity);

    article.append(iconBox, title, description, price, list, controls);
    column.appendChild(article);

    return column;
}

function showMessage(message) {
    const text = document.createElement("p");
    text.className = "text-muted text-center";
    text.textContent = message;

    grid.replaceChildren(text);
}

async function loadServices() {
    try {
        const response = await apiRequest("/services");
        const services = response.services ?? [];

        if (services.length === 0) {
            showMessage("Por ahora no hay servicios disponibles.");
            return;
        }

        grid.replaceChildren(...services.map(createServiceCard));
    } catch (error) {
        console.error("Service loading failed:", error);
        showMessage("No se pudieron cargar los servicios. Inténtalo más tarde.");
    }
}

function resetSelection() {
    selection.clear();

    grid.querySelectorAll("input[type='checkbox']").forEach((checkbox) => {
        checkbox.checked = false;
    });

    grid.querySelectorAll("input[type='number']").forEach((input) => {
        input.disabled = true;
        input.value = "1";
    });

    updateRequestBar();
}

// Paso 1: verifica la sesión y abre el modal de detalles.
async function submitRequest() {
    hideRequestFeedback();

    if (selection.size === 0) return;

    let user = null;

    try {
        user = (await getCurrentUser()).user;
    } catch {
        bootstrap.Modal.getOrCreateInstance(
            document.getElementById("loginModal")
        ).show();
        return;
    }

    if (Number(user.role_id) !== 4) {
        showRequestFeedback(
            "Solo las cuentas de cliente pueden solicitar servicios.",
            "warning"
        );
        return;
    }

    requestModalFeedback.classList.add("d-none");
    bootstrap.Modal.getOrCreateInstance(requestModalElement).show();
}

// Paso 2: envía la solicitud con fecha y detalles.
requestForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const items = Array.from(selection, ([service_id, quantity]) => ({
        service_id,
        quantity
    }));

    confirmRequestButton.disabled = true;

    try {
        await apiRequest("/requests", {
            method: "POST",
            body: {
                items,
                event_date: requestEventDate.value || null,
                message: requestMessage.value.trim() || null
            }
        });

        bootstrap.Modal.getInstance(requestModalElement)?.hide();
        requestForm.reset();

        showRequestFeedback(
            "¡Solicitud enviada! Puedes verla en tu perfil.",
            "success"
        );

        resetSelection();
    } catch (error) {
        requestModalFeedback.textContent = error.message;
        requestModalFeedback.classList.remove("d-none");
    } finally {
        confirmRequestButton.disabled = false;
    }
});

requestButton.addEventListener("click", submitRequest);

document.addEventListener("lumen:login", submitRequest);

loadServices();