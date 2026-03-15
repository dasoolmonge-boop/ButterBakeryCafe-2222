// Инициализация Telegram Mini App
const tg = window.Telegram.WebApp;

// Сообщаем Telegram, что приложение готово
tg.ready();

// Расширяем на весь экран
tg.expand();

// Полностью скрываем кнопку Telegram
tg.MainButton.hide();

// Глобальные переменные
let cakes = [];
let categories = [];
let user = tg.initDataUnsafe.user || {};

// Определяем, открыто ли приложение в полноэкранном режиме
const isFullScreen = tg.isExpanded || window.innerHeight > 700;

// Устанавливаем класс для body в зависимости от режима
document.body.classList.add(isFullScreen ? 'fullscreen-mode' : 'compact-mode');

// Обработка изменения размера окна
window.addEventListener('resize', () => {
    const newIsFullScreen = window.innerHeight > 700;
    document.body.classList.toggle('fullscreen-mode', newIsFullScreen);
    document.body.classList.toggle('compact-mode', !newIsFullScreen);
});

// Регистрация пользователя при загрузке
async function registerUser() {
    if (!user.id) return;

    try {
        const response = await fetch('/api/user', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                telegramId: user.id,
                userData: {
                    username: user.username,
                    first_name: user.first_name
                }
            })
        });

        if (!response.ok) {
            console.error('Ошибка регистрации пользователя');
        }
    } catch (error) {
        console.error('Ошибка регистрации пользователя:', error);
    }
}

// Загрузка категорий
async function loadCategories() {
    try {
        const response = await fetch('/api/categories');
        categories = await response.json();
        renderCategories(categories);
    } catch (error) {
        console.error('Ошибка загрузки категорий:', error);
    }
}

// Отрисовка категорий
function renderCategories(categoriesArray) {
    const container = document.getElementById('categoriesContainer');

    if (categoriesArray.length === 0) {
        container.innerHTML = '<button class="category active" data-category="all">Все</button>';
        return;
    }

    let html = '<button class="category active" data-category="all">Все</button>';

    categoriesArray.forEach(cat => {
        html += `<button class="category" data-category="${cat.id}">${cat.name}</button>`;
    });

    container.innerHTML = html;

    // Добавляем обработчики
    document.querySelectorAll('.category').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.category').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const categoryId = btn.dataset.category;
            filterCakes(categoryId);
        });
    });
}

// Загрузка данных тортов
async function loadCakes(categoryId = null) {
    try {
        let url = '/api/cakes';
        if (categoryId && categoryId !== 'all') {
            url += `?categoryId=${categoryId}`;
        }

        const response = await fetch(url);
        const data = await response.json();
        cakes = data;
        renderCakes(cakes);
    } catch (error) {
        console.error('Ошибка загрузки тортов:', error);
        showToast('Ошибка загрузки меню', 'error');

        const grid = document.getElementById('cakesGrid');
        grid.innerHTML = `
            <div class="empty-cart">
                <i class="fas fa-exclamation-circle" style="font-size: 48px; opacity: 0.3;"></i>
                <p style="margin-top: 16px;">Не удалось загрузить торты</p>
                <button class="category" onclick="loadCakes()" style="margin-top: 16px;">Повторить</button>
            </div>
        `;
    }
}

// Отрисовка тортов
function renderCakes(cakesArray) {
    const grid = document.getElementById('cakesGrid');
    grid.innerHTML = '';

    cakesArray.forEach(cake => {
        const card = document.createElement('div');
        card.className = 'cake-card';
        card.innerHTML = `
            <img src="${cake.photo}" alt="${cake.name}" class="cake-image"
                 onerror="this.src='https://via.placeholder.com/200?text=Торт'">
            <div class="cake-info">
                <div class="cake-name">${cake.name}</div>
                <div class="cake-weight">⚖️ ${cake.weight} кг</div>
                <div class="cake-description">
                    ${cake.description}
                </div>
                <div class="cake-price-row">
                    <span class="cake-price">${cake.price} ₽</span>
                    <button class="add-to-cart" data-id="${cake.id}">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
            </div>
        `;

        grid.appendChild(card);
    });

    document.querySelectorAll('.add-to-cart').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const cakeId = parseInt(btn.dataset.id);
            const cake = cakes.find(c => c.id === cakeId);
            if (cake) {
                cart.addItem(cake);
                animateButton(btn);
            }
        });
    });
}

// Фильтрация тортов по категориям
function filterCakes(categoryId) {
    loadCakes(categoryId);
}

// Анимация кнопки при добавлении
function animateButton(btn) {
    btn.classList.add('added');
    btn.innerHTML = '<i class="fas fa-check"></i>';
    setTimeout(() => {
        btn.classList.remove('added');
        btn.innerHTML = '<i class="fas fa-plus"></i>';
    }, 1000);
}

// Показать уведомление
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' :
                       type === 'error' ? 'fa-exclamation-circle' :
                       'fa-info-circle'}"></i>
        <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideUp 0.3s reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Проверка прав администратора
async function checkAdmin() {
    try {
        const response = await fetch('/api/check-admin', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userId: user.id })
        });

        const data = await response.json();

        if (data.isAdmin) {
            document.getElementById('adminLink').style.display = 'inline-block';
        }
    } catch (error) {
        console.error('Ошибка проверки прав:', error);
    }
}

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
    registerUser();
    loadCategories();
    loadCakes();
    checkAdmin();

    if (tg.HapticFeedback) {
        document.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => {
                tg.HapticFeedback.impactOccurred('light');
            });
        });
    }
});
