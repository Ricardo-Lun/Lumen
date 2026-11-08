import { apiRequest, getCurrentUser, logout } from "../auth/auth.js";

// DOM elements
const adminFeedback = document.getElementById("adminFeedback");
const logoutButton = document.getElementById("logoutButton");
const adminUserName = document.getElementById("adminUserName");

const navigation = document.getElementById("adminNavigation");
const sectionTitle = document.getElementById("sectionTitle");
const sectionDescription = document.getElementById("sectionDescription");

const sections = {
    dashboard: document.getElementById("dashboardSection"),
    services: document.getElementById("servicesSection"),
    clients: document.getElementById("clientsSection"),
    requests: document.getElementById("requestsSection")
};

// Dashboard elements
const dashboardClientCount = document.getElementById("dashboardClientCount");
const dashboardServiceCount = document.getElementById("dashboardServiceCount");
const dashboardRequestCount = document.getElementById("dashboardRequestCount");
const dashboardRecentRequests = document.getElementById("dashboardRecentRequests");

// Service elements
const servicesTableBody = document.getElementById("servicesTableBody");
const serviceSearch = document.getElementById("serviceSearch");
const serviceForm = document.getElementById("serviceForm");
const serviceModalElement = document.getElementById("serviceModal");
const createServiceButton = document.getElementById("createServiceButton");

// Client elements
const clientsTableBody = document.getElementById("clientsTableBody");
const clientSearch = document.getElementById("clientSearch");
const clientDetailsCard = document.getElementById("clientDetailsCard");
const clientForm = document.getElementById("clientForm");
const clientServicesContainer = document.getElementById("clientServicesContainer");

// Request elements
const requestsTableBody = document.getElementById("requestsTableBody");
const requestSearch = document.getElementById("requestSearch");
const requestStatusFilter = document.getElementById("requestStatusFilter");

// Forms and buttons
const saveServiceButton = document.getElementById("saveServiceButton");
const saveClientButton = document.getElementById("saveClientButton");
const cancelClientEditButton = document.getElementById("cancelClientEditButton");
const closeClientDetailsButton = document.getElementById("closeClientDetailsButton");

const roleNames = {
    1: "Admin",
    2: "Programmer",
    3: "User_Test",
    4: "User_General"
};

const sectionInformation = {
    dashboard: {
        title: "Dashboard",
        description: "Resumen general de la administración de LUMEN."
    },
    services: {
        title: "Servicios",
        description: "Administra el catálogo de servicios de LUMEN."
    },
    clients: {
        title: "Clientes",
        description: "Consulta y administra las cuentas de los clientes."
    },
    requests: {
        title: "Solicitudes",
        description: "Consulta y da seguimiento a las solicitudes."
    }
};

// Application state
let currentUser = null;
let isAdmin = false;

let services = [];
let clients = [];
let requests = [];

let selectedClient = null;

const serviceModal = window.bootstrap
    ? new bootstrap.Modal(serviceModalElement)
    : null;


// --------------------------------------------------
// General utilities
// --------------------------------------------------

function showFeedback(message, type = "danger") {
    adminFeedback.textContent = message;
    adminFeedback.className = `alert alert-${type}`;
    adminFeedback.classList.remove("d-none");
}

function hideFeedback() {
    adminFeedback.classList.add("d-none");
}

function createCell(value, className = "") {
    const cell = document.createElement("td");

    cell.textContent = value ?? "—";

    if (className) {
        cell.className = className;
    }

    return cell;
}

function createButton(text, className, onClick, icon = null) {
    const button = document.createElement("button");

    button.type = "button";
    button.className = className;

    if (icon) {
        const iconElement = document.createElement("i");
        iconElement.className = `bi ${icon} me-1`;
        button.appendChild(iconElement);
    }

    button.appendChild(document.createTextNode(text));
    button.addEventListener("click", onClick);

    return button;
}

function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "—";
    }

    return date.toLocaleDateString("es-MX", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
}

function formatPrice(value) {
    if (value === null || value === undefined || value === "") {
        return "Por definir";
    }

    return new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "MXN"
    }).format(Number(value));
}

function normalizeFeatures(features) {
    if (Array.isArray(features)) {
        return features;
    }

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

function showEmptyRow(tableBody, columnCount, message) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");

    cell.colSpan = columnCount;
    cell.className = "text-center text-muted py-4";
    cell.textContent = message;

    row.appendChild(cell);
    tableBody.replaceChildren(row);
}

function createStatusBadge(isActive) {
    const badge = document.createElement("span");

    badge.className = isActive
        ? "badge text-bg-success"
        : "badge text-bg-secondary";

    badge.textContent = isActive ? "Activo" : "Inactivo";

    return badge;
}

function createRequestStatusBadge(status) {
    const badge = document.createElement("span");

    const classes = {
        "Solicitado": "text-bg-warning",
        "En proceso": "text-bg-primary",
        "Finalizado": "text-bg-success"
    };

    badge.className = `badge ${classes[status] ?? "text-bg-secondary"}`;
    badge.textContent = status;

    return badge;
}

function getErrorMessage(error, fallback) {
    return error.message || fallback;
}


// --------------------------------------------------
// Navigation
// --------------------------------------------------

function showSection(sectionName) {
    if (!sections[sectionName]) return;

    for (const [name, section] of Object.entries(sections)) {
        section.classList.toggle("d-none", name !== sectionName);
    }

    for (const button of navigation.querySelectorAll("[data-section]")) {
        const isActive = button.dataset.section === sectionName;

        button.classList.toggle("active", isActive);
        button.classList.toggle("text-white", !isActive);
    }

    sectionTitle.textContent = sectionInformation[sectionName].title;
    sectionDescription.textContent = sectionInformation[sectionName].description;

    hideFeedback();

    // Load section data when opened.
    if (sectionName === "dashboard") {
        loadDashboard();
    }

    if (sectionName === "services") {
        loadServices();
    }

    if (sectionName === "clients") {
        loadClients();
    }

    if (sectionName === "requests") {
        loadRequests();
    }
}

navigation.addEventListener("click", (event) => {
    const button = event.target.closest("[data-section]");

    if (!button) return;

    showSection(button.dataset.section);
});


// --------------------------------------------------
// Dashboard
// --------------------------------------------------

async function loadDashboard() {
    try {
        const [clientsResponse, servicesResponse, requestsResponse] =
            await Promise.all([
                apiRequest("/admin/clients"),
                apiRequest("/admin/services"),
                apiRequest("/admin/requests")
            ]);

        const dashboardClients = clientsResponse.clients ?? [];
        const dashboardServices = servicesResponse.services ?? [];
        const dashboardRequests = requestsResponse.requests ?? [];

        const activeServices = dashboardServices.filter(
            (service) => Boolean(service.is_active)
        );

        const pendingRequests = dashboardRequests.filter(
            (request) => request.status !== "Finalizado"
        );

        dashboardClientCount.textContent = dashboardClients.length;
        dashboardServiceCount.textContent = activeServices.length;
        dashboardRequestCount.textContent = pendingRequests.length;

        renderRecentRequests(dashboardRequests.slice(0, 5));
    } catch (error) {
        console.error("Dashboard loading failed:", error);

        dashboardRecentRequests.textContent =
            "No se pudo cargar la actividad reciente.";

        showFeedback("No se pudo cargar la información del Dashboard.");
    }
}

function renderRecentRequests(recentRequests) {
    dashboardRecentRequests.replaceChildren();

    if (recentRequests.length === 0) {
        dashboardRecentRequests.textContent = "Todavía no hay solicitudes.";
        return;
    }

    const list = document.createElement("div");
    list.className = "list-group list-group-flush";

    for (const request of recentRequests) {
        const item = document.createElement("div");
        item.className = "list-group-item px-0";

        const header = document.createElement("div");
        header.className = "d-flex justify-content-between align-items-center flex-wrap gap-2";

        const information = document.createElement("div");

        const clientName = document.createElement("strong");
        clientName.textContent = request.full_name;

        const serviceName = document.createElement("p");
        serviceName.className = "text-muted small mb-0";
        serviceName.textContent = request.service_name;

        information.append(clientName, serviceName);

        header.append(
            information,
            createRequestStatusBadge(request.status)
        );

        item.appendChild(header);
        list.appendChild(item);
    }

    dashboardRecentRequests.appendChild(list);
}


// --------------------------------------------------
// Services
// --------------------------------------------------

async function loadServices() {
    try {
        const response = await apiRequest("/admin/services");

        services = response.services ?? [];

        renderServices(serviceSearch.value);
    } catch (error) {
        console.error("Service loading failed:", error);

        showEmptyRow(
            servicesTableBody,
            5,
            "No se pudieron cargar los servicios."
        );

        showFeedback("No se pudieron cargar los servicios.");
    }
}

function renderServices(searchTerm = "") {
    const query = searchTerm.trim().toLocaleLowerCase("es-MX");

    const filteredServices = services.filter((service) => {
        const searchableText = [
            service.name,
            service.description
        ].join(" ").toLocaleLowerCase("es-MX");

        return searchableText.includes(query);
    });

    servicesTableBody.replaceChildren();

    if (filteredServices.length === 0) {
        showEmptyRow(servicesTableBody, 5, "No se encontraron servicios.");
        return;
    }

    for (const service of filteredServices) {
        const row = document.createElement("tr");

        const nameCell = document.createElement("td");

        const name = document.createElement("strong");
        name.textContent = service.name;

        const description = document.createElement("small");
        description.className = "d-block text-muted";
        description.textContent = service.description;

        nameCell.append(name, description);

        const priceCell = createCell(formatPrice(service.price));

        const featuresCell = document.createElement("td");
        const features = normalizeFeatures(service.features);

        featuresCell.textContent = features.length
            ? features.join(", ")
            : "Sin características";

        const statusCell = document.createElement("td");
        statusCell.appendChild(createStatusBadge(Boolean(service.is_active)));

        const actionsCell = document.createElement("td");
        actionsCell.className = "text-end";

        if (isAdmin) {
            const actions = document.createElement("div");
            actions.className = "d-flex justify-content-end gap-2";

            actions.appendChild(
                createButton(
                    "Editar",
                    "btn btn-sm btn-outline-primary",
                    () => openServiceEditor(service),
                    "bi-pencil"
                )
            );

            actions.appendChild(
                createButton(
                    service.is_active ? "Desactivar" : "Activar",
                    service.is_active
                        ? "btn btn-sm btn-outline-danger"
                        : "btn btn-sm btn-outline-success",
                    () => toggleServiceStatus(service),
                    service.is_active ? "bi-eye-slash" : "bi-eye"
                )
            );

            actionsCell.appendChild(actions);
        } else {
            actionsCell.textContent = "Solo consulta";
        }

        row.append(
            nameCell,
            priceCell,
            featuresCell,
            statusCell,
            actionsCell
        );

        servicesTableBody.appendChild(row);
    }
}

function openServiceEditor(service = null) {
    hideFeedback();

    serviceForm.reset();

    document.getElementById("serviceId").value = service?.id ?? "";
    document.getElementById("serviceName").value = service?.name ?? "";
    document.getElementById("serviceDescription").value =
        service?.description ?? "";
    document.getElementById("servicePrice").value =
        service?.price ?? "";
    document.getElementById("serviceIcon").value =
        service?.icon ?? "";

    document.getElementById("serviceFeatures").value =
        normalizeFeatures(service?.features).join("\n");

    document.getElementById("serviceModalTitle").textContent =
        service ? "Editar servicio" : "Nuevo servicio";

    saveServiceButton.textContent =
        service ? "Guardar cambios" : "Crear servicio";

    serviceModal.show();
}

async function saveService(event) {
    event.preventDefault();

    if (!isAdmin) return;

    const serviceId = document.getElementById("serviceId").value;

    const priceValue = document.getElementById("servicePrice").value;

    const serviceData = {
        name: document.getElementById("serviceName").value.trim(),
        description: document.getElementById("serviceDescription").value.trim(),
        price: priceValue === "" ? null : Number(priceValue),
        icon: document.getElementById("serviceIcon").value.trim() || null,
        features: document.getElementById("serviceFeatures").value
            .split("\n")
            .map((feature) => feature.trim())
            .filter(Boolean)
    };

    saveServiceButton.disabled = true;

    try {
        if (serviceId) {
            await apiRequest(`/admin/services/${serviceId}`, {
                method: "PUT",
                body: serviceData
            });
        } else {
            await apiRequest("/admin/services", {
                method: "POST",
                body: serviceData
            });
        }

        serviceModal.hide();

        showFeedback(
            serviceId
                ? "Servicio actualizado correctamente."
                : "Servicio creado correctamente.",
            "success"
        );

        await loadServices();
        await loadDashboard();
    } catch (error) {
        console.error("Service saving failed:", error);

        console.log("Error completo:", error);
        console.log("Error como JSON:", JSON.stringify(error, null, 2));

        showFeedback(
            error.message || "No se pudo guardar el servicio."
        );  
    } finally {
        saveServiceButton.disabled = false;
    }
}

async function toggleServiceStatus(service) {
    if (!isAdmin) return;

    const action = service.is_active ? "desactivar" : "activar";

    if (!window.confirm(`¿Deseas ${action} el servicio "${service.name}"?`)) {
        return;
    }

    try {
        await apiRequest(`/admin/services/${service.id}/status`, {
            method: "PATCH",
            body: {
                is_active: !Boolean(service.is_active)
            }
        });

        showFeedback("Estado del servicio actualizado.", "success");

        await loadServices();
        await loadDashboard();
    } catch (error) {
        console.error("Service status update failed:", error);

        showFeedback(getErrorMessage(error, "No se pudo actualizar el servicio."));
    }
}


// --------------------------------------------------
// Clients
// --------------------------------------------------

async function loadClients() {
    try {
        const response = await apiRequest("/admin/clients");

        clients = response.clients ?? [];

        renderClients(clientSearch.value);
    } catch (error) {
        console.error("Client loading failed:", error);

        showEmptyRow(
            clientsTableBody,
            6,
            "No se pudieron cargar los clientes."
        );

        showFeedback("No se pudieron cargar los clientes.");
    }
}

function renderClients(searchTerm = "") {
    const query = searchTerm.trim().toLocaleLowerCase("es-MX");

    const filteredClients = clients.filter((client) => {
        const serviceNames = (client.services ?? [])
            .map((service) => service.name)
            .join(" ");

        const searchableText = [
            client.full_name,
            client.username,
            client.email,
            client.phone,
            serviceNames
        ].join(" ").toLocaleLowerCase("es-MX");

        return searchableText.includes(query);
    });

    clientsTableBody.replaceChildren();

    if (filteredClients.length === 0) {
        showEmptyRow(clientsTableBody, 6, "No se encontraron clientes.");
        return;
    }

    for (const client of filteredClients) {
        const row = document.createElement("tr");

        row.appendChild(createCell(client.full_name));
        row.appendChild(createCell(client.username));
        row.appendChild(createCell(client.phone));

        const servicesCell = document.createElement("td");

        const serviceNames = (client.services ?? [])
            .map((service) => service.name);

        servicesCell.textContent = serviceNames.length
            ? serviceNames.join(", ")
            : "Sin servicios asignados";

        const statusCell = document.createElement("td");
        statusCell.appendChild(createStatusBadge(Boolean(client.is_active)));

        const actionsCell = document.createElement("td");
        actionsCell.className = "text-end";

        const actions = document.createElement("div");
        actions.className = "d-flex justify-content-end gap-2";

        actions.appendChild(
            createButton(
                "Detalles",
                "btn btn-sm btn-outline-primary",
                () => openClientDetails(client.client_id),
                "bi-person"
            )
        );

        if (isAdmin) {
            actions.appendChild(
                createButton(
                    client.is_active ? "Desactivar" : "Activar",
                    client.is_active
                        ? "btn btn-sm btn-outline-danger"
                        : "btn btn-sm btn-outline-success",
                    () => toggleClientStatus(client),
                    client.is_active ? "bi-person-x" : "bi-person-check"
                )
            );
        }

        actionsCell.appendChild(actions);

        row.append(
            createCell(client.full_name),
            createCell(client.username),
            createCell(client.phone),
            servicesCell,
            statusCell,
            actionsCell
        );

        clientsTableBody.appendChild(row);
    }
}

async function openClientDetails(clientId) {
    try {
        hideFeedback();

        const response = await apiRequest(`/admin/clients/${clientId}`);

        selectedClient = response.client;
        

        document.getElementById("clientId").value = selectedClient.client_id;
        document.getElementById("clientFullName").value =
            selectedClient.full_name ?? "";
        document.getElementById("clientUsername").value =
            selectedClient.username ?? "";
        document.getElementById("clientEmail").value =
            selectedClient.email ?? "";
        document.getElementById("clientPhone").value =
            selectedClient.phone ?? "";

        document.getElementById("clientDetailsSubtitle").textContent =
            selectedClient.full_name;

        renderClientServiceOptions(selectedClient.services ?? []);

        const editableFields = [
            "clientFullName",
            "clientEmail",
            "clientPhone"
        ];

        document.getElementById("clientUsername").disabled = true;

        for (const fieldId of editableFields) {
            document.getElementById(fieldId).disabled = !isAdmin;
        }

        clientServicesContainer.querySelectorAll("input").forEach((input) => {
            input.disabled = !isAdmin;
        });

        saveClientButton.classList.toggle("d-none", !isAdmin);

        clientDetailsCard.classList.remove("d-none");

        clientDetailsCard.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    } catch (error) {
        console.error("Client detail loading failed:", error);

        showFeedback(getErrorMessage(error, "No se pudieron cargar los detalles."));
    }
}

function renderClientServiceOptions(assignedServices) {
    clientServicesContainer.replaceChildren();

    const assignedIds = new Set(
        assignedServices.map((service) => Number(service.id))
    );

    const availableServices = services.filter(
        (service) => Boolean(service.is_active)
    );

    for (const service of availableServices) {
        const wrapper = document.createElement("div");
        wrapper.className = "col-md-6";

        const label = document.createElement("label");
        label.className = "form-check border rounded p-3 d-flex gap-2 align-items-center";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "form-check-input ms-0";
        checkbox.value = service.id;
        checkbox.checked = assignedIds.has(Number(service.id));

        const text = document.createElement("span");
        text.textContent = service.name;

        label.append(checkbox, text);
        wrapper.appendChild(label);

        clientServicesContainer.appendChild(wrapper);
    }

    if (availableServices.length === 0) {
        const message = document.createElement("p");
        message.className = "text-muted";
        message.textContent = "No hay servicios activos disponibles.";

        clientServicesContainer.appendChild(message);
    }
}

async function saveClient(event) {
    event.preventDefault();

    if (!isAdmin || !selectedClient) return;

    const clientId = selectedClient.client_id;

    const clientData = {
        full_name: document.getElementById("clientFullName").value.trim(),
        email: document.getElementById("clientEmail").value.trim(),
        phone: document.getElementById("clientPhone").value.trim()
    };

    const serviceIds = Array.from(
        clientServicesContainer.querySelectorAll("input[type='checkbox']:checked")
    ).map((checkbox) => Number(checkbox.value));

    saveClientButton.disabled = true;

    try {
        await apiRequest(`/admin/clients/${clientId}`, {
            method: "PATCH",
            body: clientData
        });

        await apiRequest(`/admin/clients/${clientId}/services`, {
            method: "PUT",
            body: {
                service_ids: serviceIds
            }
        });

        showFeedback("Cliente actualizado correctamente.", "success");

        closeClientDetails();
        await loadClients();
        await loadDashboard();
    } catch (error) {
        console.error("Client update failed:", error);

        showFeedback(getErrorMessage(error, "No se pudo actualizar el cliente."));
    } finally {
        saveClientButton.disabled = false;
    }
}

async function toggleClientStatus(client) {
    if (!isAdmin) return;

    const action = client.is_active ? "desactivar" : "activar";

    if (!window.confirm(
        `¿Deseas ${action} la cuenta de ${client.full_name}?`
    )) {
        return;
    }

    try {
        await apiRequest(`/admin/clients/${client.client_id}/status`, {
            method: "PATCH",
            body: {
                is_active: !Boolean(client.is_active)
            }
        });

        showFeedback("Estado del cliente actualizado.", "success");

        await loadClients();
        await loadDashboard();
    } catch (error) {
        console.error("Client status update failed:", error);

        showFeedback(getErrorMessage(error, "No se pudo actualizar el cliente."));
    }
}

function closeClientDetails() {
    selectedClient = null;
    clientDetailsCard.classList.add("d-none");
    clientForm.reset();
    clientServicesContainer.replaceChildren();
}


// --------------------------------------------------
// Requests
// --------------------------------------------------

async function loadRequests() {
    try {
        const response = await apiRequest("/admin/requests");

        requests = response.requests ?? [];

        renderRequests();
    } catch (error) {
        console.error("Request loading failed:", error);

        showEmptyRow(
            requestsTableBody,
            8,
            "No se pudieron cargar las solicitudes."
        );

        showFeedback("No se pudieron cargar las solicitudes.");
    }
}

function renderRequests() {
    const query = requestSearch.value.trim().toLocaleLowerCase("es-MX");
    const selectedStatus = requestStatusFilter.value;

    const filteredRequests = requests.filter((request) => {
        const searchableText = [
            request.full_name,
            request.username,
            request.service_name,
            request.email
        ].join(" ").toLocaleLowerCase("es-MX");

        const matchesSearch = searchableText.includes(query);

        const matchesStatus = !selectedStatus ||
            request.status === selectedStatus;

        return matchesSearch && matchesStatus;
    });

    requestsTableBody.replaceChildren();

    if (filteredRequests.length === 0) {
        showEmptyRow(requestsTableBody, 8, "No se encontraron solicitudes.");
        return;
    }

    for (const request of filteredRequests) {
        const row = document.createElement("tr");

        const clientCell = document.createElement("td");

        const clientName = document.createElement("strong");
        clientName.textContent = request.full_name;

        const clientEmail = document.createElement("small");
        clientEmail.className = "d-block text-muted";
        clientEmail.textContent = request.email;

        clientCell.append(clientName, clientEmail);

        row.appendChild(clientCell);
        row.appendChild(createCell(request.service_name));
        row.appendChild(createCell(request.quantity));

        const messageCell = createCell(request.message || "Sin mensaje");
        messageCell.classList.add("text-wrap");

        row.appendChild(createCell(request.event_date ? formatDate(request.event_date) : "—"));

        row.appendChild(messageCell);
        row.appendChild(createCell(formatDate(request.created_at)));

        const statusCell = document.createElement("td");
        statusCell.appendChild(createRequestStatusBadge(request.status));

        row.appendChild(statusCell);

        const actionsCell = document.createElement("td");
        actionsCell.className = "text-end";

        if (isAdmin) {
            const select = document.createElement("select");
            select.className = "form-select form-select-sm";
            select.setAttribute("aria-label", "Cambiar estado de solicitud");

            const statuses = [
                "Solicitado",
                "En proceso",
                "Finalizado"
            ];

            for (const status of statuses) {
                const option = document.createElement("option");

                option.value = status;
                option.textContent = status;
                option.selected = status === request.status;

                select.appendChild(option);
            }

            const saveButton = createButton(
                "Guardar",
                "btn btn-sm btn-primary mt-2",
                () => updateRequestStatus(request, select.value),
                "bi-check-lg"
            );

            actionsCell.append(select, saveButton);
        } else {
            actionsCell.textContent = "Solo consulta";
        }

        row.appendChild(actionsCell);
        requestsTableBody.appendChild(row);
    }
}

async function updateRequestStatus(request, newStatus) {
    if (!isAdmin) return;

    if (request.status === newStatus) return;

    try {
        await apiRequest(`/admin/requests/${request.id}/status`, {
            method: "PATCH",
            body: {
                status: newStatus
            }
        });

        showFeedback("Estado de la solicitud actualizado.", "success");

        await loadRequests();
        await loadDashboard();
    } catch (error) {
        console.error("Request status update failed:", error);

        showFeedback(getErrorMessage(error, "No se pudo actualizar la solicitud."));
    }
}


// --------------------------------------------------
// Event listeners
// --------------------------------------------------

serviceSearch.addEventListener("input", () => {
    renderServices(serviceSearch.value);
});

clientSearch.addEventListener("input", () => {
    renderClients(clientSearch.value);
});

requestSearch.addEventListener("input", renderRequests);

requestStatusFilter.addEventListener("change", renderRequests);

createServiceButton.addEventListener("click", () => {
    openServiceEditor();
});

serviceForm.addEventListener("submit", saveService);

clientForm.addEventListener("submit", saveClient);

cancelClientEditButton.addEventListener("click", closeClientDetails);

closeClientDetailsButton.addEventListener("click", closeClientDetails);

logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    hideFeedback();

    try {
        await logout();
        window.location.replace("index.html");
    } catch (error) {
        console.error("Logout failed:", error);

        showFeedback("No se pudo cerrar la sesión. Inténtalo de nuevo.");
        logoutButton.disabled = false;
    }
});


// --------------------------------------------------
// Initialization
// --------------------------------------------------

async function loadAdminPanel() {
    try {
        const session = await getCurrentUser();

        currentUser = session.user;

        if (!currentUser) {
            window.location.replace("index.html");
            return;
        }

        const roleId = Number(currentUser.role_id);

        if (roleId === 4) {
            window.location.replace("profile.html");
            return;
        }

        if (![1, 2, 3].includes(roleId)) {
            window.location.replace("index.html");
            return;
        }

        isAdmin = roleId === 1;

        adminUserName.textContent =
            `${currentUser.username} (${roleNames[roleId]})`;

        // Hide write actions for read-only roles.
        createServiceButton.classList.toggle("d-none", !isAdmin);

        if (!isAdmin) {
            saveServiceButton.classList.add("d-none");
            saveClientButton.classList.add("d-none");
        }

        await loadDashboard();
    } catch (error) {
        if (error.status === 401 || error.status === 403) {
            window.location.replace("index.html");
            return;
        }

        console.error("Admin panel initialization failed:", error);

        showFeedback("No se pudo cargar el panel administrativo.");
    } finally {
        document.body.classList.remove("auth-pending");
    }
}



loadAdminPanel();
