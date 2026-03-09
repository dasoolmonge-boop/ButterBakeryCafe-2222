// admin.js - Логика админ-панели с категориями, пользователями и назначением курьеров

const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

let currentUser = tg.initDataUnsafe.user || {};
let isAdmin = false;
let currentOrdersTab = 'active';

// Проверка прав администратора
async function checkAdmin() {
    try {
        const response = await fetch('/api/check-admin', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userId: currentUser.id })
        });

        const data = await response.json();
        isAdmin = data.isAdmin;

        if (!isAdmin) {
            showToast('У вас нет прав доступа к админ-панели', 'error');
            setTimeout(() => {
                window.location.href = '/';
            }, 2000);
        } else {
            loadCategories();
            loadCakes();
            loadUsers();
            loadOrders();
            loadStats();
        }
    } catch (error) {
        console.error('Ошибка проверки прав:', error);
    }
}

// Переключение основных вкладок
function switchTab(tab) {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));

    document.querySelector(`[onclick="switchTab('${tab}')"]`).classList.add('active');
    document.getElementById(`${tab}-section`).classList.add('active');

    if (tab === 'cakes') {
        loadCategories();
        loadCakes();
    }
    if (tab === 'categories') loadCategories();
    if (tab === 'users') loadUsers();
    if (tab === 'orders') loadOrders();
    if (tab === 'stats') loadStats();
}

// Переключение вкладок заказов
function switchOrdersTab(tab) {
    currentOrdersTab = tab;

    document.querySelectorAll('.order-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.orders-tab-content').forEach(c => c.classList.remove('active'));

    document.querySelector(`[onclick="switchOrdersTab('${tab}')"]`).classList.add('active');
    document.getElementById(`${tab}-orders`).classList.add('active');

    loadOrders();
}

// Предпросмотр фото
function previewPhoto(input, previewId) {
    const preview = document.getElementById(previewId);

    if (input.files && input.files[0]) {
        const reader = new FileReader();

        reader.onload = function(e) {
            preview.src = e.target.result;
            preview.classList.add('show');
        }

        reader.readAsDataURL(input.files[0]);
    }
}

// Загрузка фото на сервер
async function uploadPhoto(file) {
    const formData = new FormData();
    formData.append('photo', file);

    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            return data.url;
        } else {
            throw new Error('Ошибка загрузки');
        }
    } catch (error) {
        console.error('Ошибка загрузки фото:', error);
        showToast('Ошибка при загрузке фото', 'error');
        return null;
    }
}

// ============================================
// УПРАВЛЕНИЕ КАТЕГОРИЯМИ
// ============================================

// Загрузка категорий для выпадающего списка
async function loadCategoriesForSelect() {
    try {
        const response = await fetch('/api/admin/categories');
        const categories = await response.json();

        const selects = ['cakeCategory', 'editCakeCategory'];

        selects.forEach(selectId => {
            const select = document.getElementById(selectId);
            if (select) {
                select.innerHTML = '<option value="">Выберите категорию</option>';
                categories.forEach(cat => {
                    select.innerHTML += `<option value="${cat.id}">${cat.name}</option>`;
                });
            }
        });

        return categories;
    } catch (error) {
        console.error('Ошибка загрузки категорий:', error);
        return [];
    }
}

// Загрузка категорий для отображения
async function loadCategories() {
    try {
        const response = await fetch('/api/admin/categories');
        const categories = await response.json();
        renderAdminCategories(categories);
        await loadCategoriesForSelect();
    } catch (error) {
        console.error('Ошибка загрузки категорий:', error);
        showToast('Ошибка загрузки категорий', 'error');
    }
}

// Отрисовка категорий в админке
function renderAdminCategories(categories) {
    const grid = document.getElementById('adminCategoriesGrid');

    if (!grid) return;

    if (categories.length === 0) {
        grid.innerHTML = '<div class="empty-cart">Категории не добавлены</div>';
        return;
    }

    grid.innerHTML = categories.map(cat => `
        <div class="category-card">
            <div class="category-header">
                <span class="category-name">${cat.name}</span>
                <div class="category-actions">
                    <button class="category-action-btn edit" onclick="editCategory(${cat.id})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="category-action-btn delete" onclick="deleteCategory(${cat.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="category-description">${cat.description || 'Нет описания'}</div>
        </div>
    `).join('');
}

// Добавление категории
async function addCategory(event) {
    event.preventDefault();

    const name = document.getElementById('categoryName').value;
    const description = document.getElementById('categoryDescription').value;

    try {
        const response = await fetch('/api/admin/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description })
        });

        if (response.ok) {
            showToast('Категория добавлена!', 'success');
            document.getElementById('addCategoryForm').reset();
            loadCategories();

            if (tg.HapticFeedback) {
                tg.HapticFeedback.notificationOccurred('success');
            }
        }
    } catch (error) {
        console.error('Ошибка добавления категории:', error);
        showToast('Ошибка при добавлении категории', 'error');
    }
}

// Редактирование категории
async function editCategory(categoryId) {
    try {
        const response = await fetch('/api/admin/categories');
        const categories = await response.json();
        const category = categories.find(c => c.id === categoryId);

        if (category) {
            document.getElementById('editCategoryId').value = category.id;
            document.getElementById('editCategoryName').value = category.name;
            document.getElementById('editCategoryDescription').value = category.description || '';

            document.getElementById('editCategoryModal').classList.add('open');
        }
    } catch (error) {
        console.error('Ошибка загрузки данных категории:', error);
        showToast('Ошибка загрузки данных', 'error');
    }
}

// Сохранение изменений категории
async function saveCategoryEdit(event) {
    event.preventDefault();

    const categoryId = document.getElementById('editCategoryId').value;
    const name = document.getElementById('editCategoryName').value;
    const description = document.getElementById('editCategoryDescription').value;

    try {
        const response = await fetch(`/api/admin/categories/${categoryId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description })
        });

        if (response.ok) {
            showToast('Изменения сохранены!', 'success');
            closeEditCategoryModal();
            loadCategories();

            if (tg.HapticFeedback) {
                tg.HapticFeedback.notificationOccurred('success');
            }
        }
    } catch (error) {
        console.error('Ошибка сохранения категории:', error);
        showToast('Ошибка при сохранении', 'error');
    }
}

// Удаление категории
async function deleteCategory(categoryId) {
    if (!confirm('Вы уверены, что хотите удалить эту категорию?')) return;

    try {
        const response = await fetch(`/api/admin/categories/${categoryId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showToast('Категория удалена', 'success');
            loadCategories();
        } else {
            const data = await response.json();
            showToast(data.error || 'Ошибка при удалении', 'error');
        }
    } catch (error) {
        console.error('Ошибка удаления категории:', error);
        showToast('Ошибка при удалении', 'error');
    }
}

// Закрытие модального окна редактирования категории
function closeEditCategoryModal() {
    document.getElementById('editCategoryModal').classList.remove('open');
    document.getElementById('editCategoryForm').reset();
}

// ============================================
// УПРАВЛЕНИЕ ТОРТАМИ
// ============================================

// Загрузка тортов для админа
async function loadCakes() {
    try {
        const response = await fetch('/api/admin/cakes');
        const cakes = await response.json();
        renderAdminCakes(cakes);
    } catch (error) {
        console.error('Ошибка загрузки тортов:', error);
        showToast('Ошибка загрузки тортов', 'error');
    }
}

// Отрисовка тортов в админке
function renderAdminCakes(cakes) {
    const grid = document.getElementById('adminCakesGrid');

    if (cakes.length === 0) {
        grid.innerHTML = '<div class="empty-cart">Торты не добавлены</div>';
        return;
    }

    grid.innerHTML = cakes.map(cake => `
        <div class="cake-card admin-card ${!cake.available ? 'unavailable' : ''}">
            <img src="${cake.photo}" alt="${cake.name}" class="cake-image"
                 onerror="this.src='https://via.placeholder.com/200?text=Торт'">
            <div class="cake-actions">
                <button class="cake-action-btn edit" onclick="editCake(${cake.id})">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="cake-action-btn toggle" onclick="toggleCakeAvailability(${cake.id})">
                    <i class="fas ${cake.available ? 'fa-eye' : 'fa-eye-slash'}"></i>
                </button>
                <button class="cake-action-btn delete" onclick="deleteCake(${cake.id})">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
            <div class="cake-info">
                <div class="cake-name">${cake.name}</div>
                <div class="cake-price">${cake.price} ₽</div>
                <div class="cake-weight">⚖️ ${cake.weight} кг</div>
                <div class="cake-description">${cake.description}</div>
                <div class="cake-status">
                    Статус: ${cake.available ? '✅ Доступен' : '❌ Недоступен'}
                </div>
            </div>
        </div>
    `).join('');
}

// Добавление нового торта
async function addCake(event) {
    event.preventDefault();

    const photoInput = document.getElementById('cakePhotoInput');

    if (!photoInput.files || !photoInput.files[0]) {
        showToast('Выберите фото торта', 'error');
        return;
    }

    const submitBtn = event.target.querySelector('.submit-btn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Загрузка...';

    try {
        const photoUrl = await uploadPhoto(photoInput.files[0]);

        if (!photoUrl) {
            throw new Error('Ошибка загрузки фото');
        }

        const cakeData = {
            name: document.getElementById('cakeName').value,
            price: parseInt(document.getElementById('cakePrice').value),
            weight: parseFloat(document.getElementById('cakeWeight').value),
            description: document.getElementById('cakeDescription').value,
            categoryId: parseInt(document.getElementById('cakeCategory').value),
            photo: photoUrl
        };

        const response = await fetch('/api/admin/cakes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(cakeData)
        });

        if (response.ok) {
            showToast('Торт успешно добавлен!', 'success');
            document.getElementById('addCakeForm').reset();
            document.getElementById('cakePhotoPreview').classList.remove('show');
            loadCakes();

            if (tg.HapticFeedback) {
                tg.HapticFeedback.notificationOccurred('success');
            }
        }
    } catch (error) {
        console.error('Ошибка добавления:', error);
        showToast('Ошибка при добавлении торта', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-plus"></i> Добавить торт';
    }
}

// Редактирование торта
async function editCake(cakeId) {
    try {
        const [cakesResponse, categoriesResponse] = await Promise.all([
            fetch('/api/admin/cakes'),
            fetch('/api/admin/categories')
        ]);

        const cakes = await cakesResponse.json();
        const categories = await categoriesResponse.json();
        const cake = cakes.find(c => c.id === cakeId);

        if (cake) {
            document.getElementById('editCakeId').value = cake.id;
            document.getElementById('editCakeName').value = cake.name;
            document.getElementById('editCakePrice').value = cake.price;
            document.getElementById('editCakeWeight').value = cake.weight;
            document.getElementById('editCakeDescription').value = cake.description;
            document.getElementById('editCakePhoto').value = cake.photo;

            const categorySelect = document.getElementById('editCakeCategory');
            categorySelect.innerHTML = '<option value="">Выберите категорию</option>';
            categories.forEach(cat => {
                const selected = cat.id === cake.categoryId ? 'selected' : '';
                categorySelect.innerHTML += `<option value="${cat.id}" ${selected}>${cat.name}</option>`;
            });

            const preview = document.getElementById('editCakePhotoPreview');
            preview.src = cake.photo;
            preview.classList.add('show');

            document.getElementById('editCakeModal').classList.add('open');
        }
    } catch (error) {
        console.error('Ошибка загрузки данных торта:', error);
        showToast('Ошибка загрузки данных', 'error');
    }
}

// Сохранение изменений торта
async function saveCakeEdit(event) {
    event.preventDefault();

    const cakeId = document.getElementById('editCakeId').value;
    const photoInput = document.getElementById('editCakePhotoInput');
    let photoUrl = document.getElementById('editCakePhoto').value;

    const submitBtn = event.target.querySelector('.submit-btn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Сохранение...';

    try {
        if (photoInput.files && photoInput.files[0]) {
            const newPhotoUrl = await uploadPhoto(photoInput.files[0]);
            if (newPhotoUrl) {
                photoUrl = newPhotoUrl;
            }
        }

        const cakeData = {
            name: document.getElementById('editCakeName').value,
            price: parseInt(document.getElementById('editCakePrice').value),
            weight: parseFloat(document.getElementById('editCakeWeight').value),
            description: document.getElementById('editCakeDescription').value,
            categoryId: parseInt(document.getElementById('editCakeCategory').value),
            photo: photoUrl
        };

        const response = await fetch(`/api/admin/cakes/${cakeId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(cakeData)
        });

        if (response.ok) {
            showToast('Изменения сохранены!', 'success');
            closeEditModal();
            loadCakes();

            if (tg.HapticFeedback) {
                tg.HapticFeedback.notificationOccurred('success');
            }
        }
    } catch (error) {
        console.error('Ошибка сохранения:', error);
        showToast('Ошибка при сохранении', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Сохранить изменения';
    }
}

// Переключение доступности торта
async function toggleCakeAvailability(cakeId) {
    try {
        const response = await fetch('/api/admin/cakes');
        const cakes = await response.json();
        const cake = cakes.find(c => c.id === cakeId);

        const updateResponse = await fetch(`/api/admin/cakes/${cakeId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ available: !cake.available })
        });

        if (updateResponse.ok) {
            showToast(`Торт ${cake.available ? 'скрыт' : 'опубликован'}`, 'success');
            loadCakes();
        }
    } catch (error) {
        console.error('Ошибка:', error);
        showToast('Ошибка при изменении статуса', 'error');
    }
}

// Удаление торта
async function deleteCake(cakeId) {
    if (!confirm('Вы уверены, что хотите удалить этот торт?')) return;

    try {
        const response = await fetch(`/api/admin/cakes/${cakeId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showToast('Торт удален', 'success');
            loadCakes();

            if (tg.HapticFeedback) {
                tg.HapticFeedback.notificationOccurred('success');
            }
        }
    } catch (error) {
        console.error('Ошибка удаления:', error);
        showToast('Ошибка при удалении', 'error');
    }
}

// Закрытие модального окна редактирования торта
function closeEditModal() {
    document.getElementById('editCakeModal').classList.remove('open');
    document.getElementById('editCakeForm').reset();
    document.getElementById('editCakePhotoPreview').classList.remove('show');
}

// ============================================
// УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ
// ============================================

// Загрузка пользователей (только админы и курьеры)
async function loadUsers() {
    try {
        const response = await fetch('/api/admin/users');
        const users = await response.json();
        renderAdminUsers(users);
    } catch (error) {
        console.error('Ошибка загрузки пользователей:', error);
        showToast('Ошибка загрузки пользователей', 'error');
    }
}

// Отрисовка пользователей в админке
function renderAdminUsers(users) {
    const grid = document.getElementById('adminUsersGrid');

    if (users.length === 0) {
        grid.innerHTML = '<div class="empty-cart">Нет сотрудников</div>';
        return;
    }

    grid.innerHTML = users.map(user => `
        <div class="user-card">
            <span class="user-role-badge ${user.role}">${user.role === 'admin' ? 'Админ' : 'Курьер'}</span>
            <div class="user-info">
                <div class="user-name">${user.firstName}</div>
                <div class="user-detail"><i class="fas fa-user"></i> @${user.username || 'нет'}</div>
                <div class="user-detail"><i class="fas fa-id-badge"></i> ID: ${user.telegramId}</div>
                <div class="user-detail"><i class="fas fa-phone"></i> ${user.phone || 'не указан'}</div>
            </div>
            <div class="user-shift-toggle">
                <span>На смене</span>
                <label class="toggle-switch">
                    <input type="checkbox" ${user.onShift ? 'checked' : ''} onchange="toggleUserShift(${user.id})">
                    <span class="toggle-slider"></span>
                </label>
            </div>
            <div class="order-actions">
                <button class="action-btn" onclick="editUser(${user.id})">
                    <i class="fas fa-edit"></i> Редактировать
                </button>
                <button class="action-btn cancel-btn" onclick="deleteUser(${user.id})">
                    <i class="fas fa-trash"></i> Удалить
                </button>
            </div>
        </div>
    `).join('');
}

// Добавление пользователя
async function addUser(event) {
    event.preventDefault();

    const userData = {
        telegramId: parseInt(document.getElementById('userTelegramId').value),
        username: document.getElementById('userUsername').value,
        firstName: document.getElementById('userFirstName').value,
        role: document.getElementById('userRole').value,
        phone: document.getElementById('userPhone').value
    };

    try {
        const response = await fetch('/api/admin/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData)
        });

        if (response.ok) {
            showToast('Сотрудник добавлен!', 'success');
            document.getElementById('addUserForm').reset();
            loadUsers();

            if (tg.HapticFeedback) {
                tg.HapticFeedback.notificationOccurred('success');
            }
        } else {
            const data = await response.json();
            showToast(data.error || 'Ошибка добавления', 'error');
        }
    } catch (error) {
        console.error('Ошибка добавления пользователя:', error);
        showToast('Ошибка при добавлении', 'error');
    }
}

// Редактирование пользователя
async function editUser(userId) {
    try {
        const response = await fetch('/api/admin/users');
        const users = await response.json();
        const user = users.find(u => u.id === userId);

        if (user) {
            document.getElementById('editUserId').value = user.id;
            document.getElementById('editUserTelegramId').value = user.telegramId;
            document.getElementById('editUserUsername').value = user.username || '';
            document.getElementById('editUserFirstName').value = user.firstName;
            document.getElementById('editUserRole').value = user.role;
            document.getElementById('editUserPhone').value = user.phone || '';

            document.getElementById('editUserModal').classList.add('open');
        }
    } catch (error) {
        console.error('Ошибка загрузки данных пользователя:', error);
        showToast('Ошибка загрузки данных', 'error');
    }
}

// Сохранение изменений пользователя
async function saveUserEdit(event) {
    event.preventDefault();

    const userId = document.getElementById('editUserId').value;
    const userData = {
        username: document.getElementById('editUserUsername').value,
        firstName: document.getElementById('editUserFirstName').value,
        role: document.getElementById('editUserRole').value,
        phone: document.getElementById('editUserPhone').value
    };

    try {
        const response = await fetch(`/api/admin/users/${userId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData)
        });

        if (response.ok) {
            showToast('Изменения сохранены!', 'success');
            closeEditUserModal();
            loadUsers();

            if (tg.HapticFeedback) {
                tg.HapticFeedback.notificationOccurred('success');
            }
        } else {
            const data = await response.json();
            showToast(data.error || 'Ошибка сохранения', 'error');
        }
    } catch (error) {
        console.error('Ошибка сохранения пользователя:', error);
        showToast('Ошибка при сохранении', 'error');
    }
}

// Удаление пользователя
async function deleteUser(userId) {
    if (!confirm('Вы уверены, что хотите удалить этого сотрудника?')) return;

    try {
        const response = await fetch(`/api/admin/users/${userId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showToast('Сотрудник удален', 'success');
            loadUsers();
        } else {
            const data = await response.json();
            showToast(data.error || 'Ошибка удаления', 'error');
        }
    } catch (error) {
        console.error('Ошибка удаления пользователя:', error);
        showToast('Ошибка при удалении', 'error');
    }
}

// Переключение статуса "На смене"
async function toggleUserShift(userId) {
    try {
        const response = await fetch(`/api/admin/users/${userId}/toggle-shift`, {
            method: 'POST'
        });

        if (response.ok) {
            const data = await response.json();
            showToast(`Статус обновлен`, 'success');
            loadUsers();
        }
    } catch (error) {
        console.error('Ошибка переключения статуса:', error);
        showToast('Ошибка при изменении статуса', 'error');
    }
}

// Закрытие модального окна редактирования пользователя
function closeEditUserModal() {
    document.getElementById('editUserModal').classList.remove('open');
    document.getElementById('editUserForm').reset();
}

// ============================================
// УПРАВЛЕНИЕ ЗАКАЗАМИ
// ============================================

// Загрузка заказов
async function loadOrders() {
    try {
        const [activeResponse, historyResponse, couriersResponse] = await Promise.all([
            fetch('/api/admin/orders/active'),
            fetch('/api/admin/orders/history'),
            fetch('/api/admin/couriers/on-shift')
        ]);

        const activeOrders = await activeResponse.json();
        const historyOrders = await historyResponse.json();
        const couriersOnShift = await couriersResponse.json();

        document.getElementById('activeOrdersCount').textContent = activeOrders.length;
        document.getElementById('historyOrdersCount').textContent = historyOrders.length;

        if (currentOrdersTab === 'active') {
            renderOrders(activeOrders, 'activeOrdersList', couriersOnShift);
        } else {
            renderOrders(historyOrders, 'historyOrdersList', []);
        }
    } catch (error) {
        console.error('Ошибка загрузки заказов:', error);
    }
}

// Отрисовка заказов
function renderOrders(orders, containerId, couriersOnShift = []) {
    const container = document.getElementById(containerId);

    if (orders.length === 0) {
        container.innerHTML = '<div class="empty-cart">Нет заказов</div>';
        return;
    }

    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    let html = '<div class="orders-grid">';

    orders.forEach(order => {
        const statusText = getStatusText(order.status);
        const statusClass = getStatusClass(order.status);

        html += `
            <div class="order-card">
                <div class="order-header">
                    <span class="order-id">#${order.id}</span>
                    <span class="status-badge ${statusClass}">${statusText}</span>
                </div>
                <div class="order-info">
                    <div><i class="fas fa-user"></i> ${order.name}</div>
                    <div><i class="fas fa-phone"></i> ${order.phone}</div>
                    <div><i class="fas fa-map-marker-alt"></i> ${order.address}</div>
                    <div><i class="fas fa-calendar"></i> ${order.deliveryDate} ${order.deliveryTime}</div>
                    <div><i class="fas fa-comment"></i> ${order.wish}</div>
                    <div class="order-cakes">
                        ${order.cart.map(item => `
                            <div class="order-cake-item">
                                <span>${item.name} × ${item.quantity}</span>
                                <span>${item.price * item.quantity} ₽</span>
                            </div>
                        `).join('')}
                    </div>
                    <div class="order-total">Итого: ${order.totalPrice} ₽</div>
                    <div class="order-date">${new Date(order.createdAt).toLocaleString()}</div>
                </div>
                ${renderOrderActions(order, couriersOnShift)}
            </div>
        `;
    });

    html += '</div>';
    container.innerHTML = html;
}

// Отрисовка действий для заказа в зависимости от статуса
function renderOrderActions(order, couriersOnShift) {
    if (order.status === 'active') {
        return `
            <div class="order-actions">
                ${couriersOnShift.length > 0 ? `
                    <select id="courierSelect-${order.id}" class="form-group" style="flex: 2; padding: 8px; border-radius: 8px; background: var(--tg-bg); color: var(--tg-text); border: 1px solid var(--border-color);">
                        <option value="">Назначить курьера</option>
                        ${couriersOnShift.map(c => `<option value="${c.id}">${c.firstName} (${c.phone || 'нет телефона'})</option>`).join('')}
                    </select>
                    <button onclick="assignCourier(${order.id})" class="action-btn assign-btn">
                        <i class="fas fa-truck"></i> Назначить
                    </button>
                ` : '<div style="color: var(--tg-hint);">Нет курьеров на смене</div>'}
                <button onclick="updateOrderStatus(${order.id}, 'cancelled')" class="action-btn cancel-btn">
                    <i class="fas fa-times"></i> Отменить
                </button>
            </div>
        `;
    }

    if (order.status === 'assigned_to_courier') {
        return `
            <div class="order-actions">
                <button onclick="updateOrderStatus(${order.id}, 'delivered')" class="action-btn complete-btn">
                    <i class="fas fa-check"></i> Доставлен
                </button>
                <button onclick="updateOrderStatus(${order.id}, 'cancelled')" class="action-btn cancel-btn">
                    <i class="fas fa-times"></i> Отменить
                </button>
            </div>
        `;
    }

    if (order.status === 'cancelled') {
        return `
            <div class="order-actions">
                <button onclick="updateOrderStatus(${order.id}, 'active')" class="action-btn restore-btn">
                    <i class="fas fa-undo"></i> Восстановить
                </button>
            </div>
        `;
    }

    return ''; // Для delivered и других финальных статусов без действий
}

// Назначение курьера на заказ
async function assignCourier(orderId) {
    const select = document.getElementById(`courierSelect-${orderId}`);
    const courierId = select.value;

    if (!courierId) {
        showToast('Выберите курьера', 'error');
        return;
    }

    try {
        const response = await fetch(`/api/admin/orders/${orderId}/assign-courier`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ courierId: parseInt(courierId) })
        });

        if (response.ok) {
            showToast('Курьер назначен', 'success');
            loadOrders();

            if (tg.HapticFeedback) {
                tg.HapticFeedback.impactOccurred('medium');
            }
        }
    } catch (error) {
        console.error('Ошибка назначения курьера:', error);
        showToast('Ошибка при назначении курьера', 'error');
    }
}

// Обновление статуса заказа
async function updateOrderStatus(orderId, status) {
    try {
        const response = await fetch(`/api/admin/orders/${orderId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });

        if (response.ok) {
            showToast(`Статус заказа обновлен`, 'success');
            loadOrders();
            loadStats();

            if (tg.HapticFeedback) {
                tg.HapticFeedback.impactOccurred('medium');
            }
        }
    } catch (error) {
        console.error('Ошибка:', error);
        showToast('Ошибка при обновлении статуса', 'error');
    }
}

// ============================================
// СТАТИСТИКА
// ============================================

// Загрузка статистики
async function loadStats() {
    try {
        const response = await fetch('/api/admin/orders');
        const orders = await response.json();

        const activeOrders = orders.filter(o => o.status === 'active' || o.status === 'assigned_to_courier').length;
        const completedOrders = orders.filter(o => o.status === 'delivered');
        const totalRevenue = completedOrders.reduce((sum, o) => sum + o.totalPrice, 0);
        const avgOrder = completedOrders.length ? Math.round(totalRevenue / completedOrders.length) : 0;

        const cakeCount = {};
        orders.forEach(order => {
            if (order.cart) {
                order.cart.forEach(item => {
                    cakeCount[item.name] = (cakeCount[item.name] || 0) + item.quantity;
                });
            }
        });

        let popularCake = 'Нет данных';
        let maxCount = 0;
        for (const [name, count] of Object.entries(cakeCount)) {
            if (count > maxCount) {
                maxCount = count;
                popularCake = name;
            }
        }

        document.getElementById('totalOrders').textContent = orders.length;
        document.getElementById('activeOrders').textContent = activeOrders;
        document.getElementById('completedOrders').textContent = completedOrders.length;
        document.getElementById('totalRevenue').textContent = `${totalRevenue} ₽`;
        document.getElementById('avgOrder').textContent = `${avgOrder} ₽`;
        document.getElementById('popularCake').textContent = popularCake;

        createOrdersChart(orders);

    } catch (error) {
        console.error('Ошибка загрузки статистики:', error);
    }
}

// Создание графика заказов
function createOrdersChart(orders) {
    const ctx = document.getElementById('ordersChart').getContext('2d');

    const last7Days = [];
    const counts = [];

    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toLocaleDateString('ru-RU');
        last7Days.push(dateStr);

        const count = orders.filter(o => {
            const orderDate = new Date(o.createdAt).toLocaleDateString('ru-RU');
            return orderDate === dateStr;
        }).length;

        counts.push(count);
    }

    if (window.ordersChart) {
        window.ordersChart.destroy();
    }

    window.ordersChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: last7Days,
            datasets: [{
                label: 'Заказы',
                data: counts,
                borderColor: '#D4A373',
                backgroundColor: 'rgba(212, 163, 115, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                        color: '#B0B0B0'
                    },
                    grid: {
                        color: '#404040'
                    }
                },
                x: {
                    ticks: {
                        color: '#B0B0B0'
                    },
                    grid: {
                        color: '#404040'
                    }
                }
            }
        }
    });
}

// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================

function getStatusText(status) {
    const statusMap = {
        'active': 'Новый',
        'assigned_to_courier': 'Передан курьеру',
        'delivered': 'Доставлен',
        'cancelled': 'Отменен'
    };
    return statusMap[status] || status;
}

function getStatusClass(status) {
    const classMap = {
        'active': 'status-active',
        'assigned_to_courier': 'status-assigned',
        'delivered': 'status-completed',
        'cancelled': 'status-cancelled'
    };
    return classMap[status] || '';
}

function showToast(message, type) {
    let toast = document.querySelector('.toast');
    if (toast) {
        toast.remove();
    }

    toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' :
                       type === 'error' ? 'fa-exclamation-circle' :
                       'fa-info-circle'}"></i>
        <span>${message}</span>
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', checkAdmin);