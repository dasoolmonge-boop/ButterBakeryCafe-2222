// app.js - Сервер для мини-приложения с ролями, категориями и назначением курьеров
const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');
const url = require('url');

// Загружаем переменные окружения из .env файла (для локальной разработки)
try {
    require('dotenv').config();
} catch (e) {
    console.log('dotenv не установлен, используем системные переменные окружения');
}

const PORT = process.env.PORT || 3000;

// Важные переменные окружения - БЕЗОПАСНОСТЬ!
const BOT_TOKEN = process.env.BOT_TOKEN;
const SITE_DOMAIN = process.env.SITE_DOMAIN || 'butterbakerycafe.bothost.ru';
const ADMIN_ID = process.env.ADMIN_ID ? parseInt(process.env.ADMIN_ID) : 1066867845;

// Настройки автоочистки истории заказов
const AUTO_CLEANUP_ENABLED = process.env.AUTO_CLEANUP_ENABLED !== 'false'; // По умолчанию true
const CLEANUP_INTERVAL_HOURS = parseInt(process.env.CLEANUP_INTERVAL_HOURS) || 24; // Проверка каждые 24 часа
const MAX_ORDER_AGE_DAYS = parseInt(process.env.MAX_ORDER_AGE_DAYS) || 7; // Удалять заказы старше 7 дней
const CLEANUP_TIME = process.env.CLEANUP_TIME || '03:00'; // Время очистки (3 часа ночи)

// Проверяем наличие обязательных переменных
if (!BOT_TOKEN) {
    console.error('❌ Ошибка: Не задан BOT_TOKEN в переменных окружения!');
    console.error('Пожалуйста, создайте файл .env или установите переменную окружения BOT_TOKEN');
    process.exit(1);
}

// Определяем окружение (production или development)
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Путь к папке с данными (для production используем /app/data, для разработки - текущую папку)
const DATA_DIR = IS_PRODUCTION ? '/app/data' : path.join(__dirname, 'data');

// Путь к файлу базы данных
const DB_FILE = path.join(DATA_DIR, 'db.json');

// Путь к папке для загрузок - теперь тоже в DATA_DIR!
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

// Путь к лог-файлу для очистки истории
const CLEANUP_LOG_FILE = path.join(DATA_DIR, 'cleanup.log');

// MIME типы для статических файлов
const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

// Создаем необходимые папки
console.log('\n📁 Проверка папок для данных...');

// Создаем папку data, если её нет
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log(`✅ Создана папка для данных: ${DATA_DIR}`);
} else {
    console.log(`✅ Папка для данных существует: ${DATA_DIR}`);
}

// Создаем папку для загрузок, если её нет
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    console.log(`✅ Создана папка для загрузок: ${UPLOAD_DIR}`);
} else {
    console.log(`✅ Папка для загрузок существует: ${UPLOAD_DIR}`);
}

// Проверяем права на запись в папку данных
try {
    fs.accessSync(DATA_DIR, fs.constants.W_OK);
    console.log(`✅ Папка ${DATA_DIR} доступна для записи`);
} catch (err) {
    console.error(`❌ Нет прав на запись в ${DATA_DIR}!`, err.message);
    if (IS_PRODUCTION) {
        console.error('Критическая ошибка в production режиме!');
        process.exit(1);
    }
}

// ============================================
// ФУНКЦИИ ДЛЯ ЛОГИРОВАНИЯ ОЧИСТКИ
// ============================================

function logCleanup(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${type.toUpperCase()}] ${message}\n`;
    
    console.log(logMessage.trim());
    
    try {
        fs.appendFileSync(CLEANUP_LOG_FILE, logMessage);
    } catch (error) {
        console.error('❌ Ошибка записи в лог-файл:', error.message);
    }
}

// ============================================
// ФУНКЦИИ ДЛЯ АВТОМАТИЧЕСКОЙ ОЧИСТКИ ИСТОРИИ
// ============================================

/**
 * Очистка старых заказов из истории
 * @returns {Object} Результат очистки
 */
function cleanupOldOrders() {
    try {
        const db = readDB();
        const now = new Date();
        const maxAgeMs = MAX_ORDER_AGE_DAYS * 24 * 60 * 60 * 1000;
        
        // Сохраняем активные заказы (не завершенные и не отмененные) независимо от возраста
        const activeOrders = db.orders.filter(o => 
            o.status !== 'delivered' && o.status !== 'cancelled'
        );
        
        // Для истории (доставленные и отмененные) применяем фильтр по дате
        const recentHistoryOrders = db.orders.filter(o => {
            if (o.status !== 'delivered' && o.status !== 'cancelled') return false;
            
            const orderDate = new Date(o.createdAt);
            const ageMs = now - orderDate;
            return ageMs <= maxAgeMs;
        });
        
        // Находим заказы, которые будут удалены (для логирования)
        const deletedOrders = db.orders.filter(o => {
            if (o.status !== 'delivered' && o.status !== 'cancelled') return false;
            
            const orderDate = new Date(o.createdAt);
            const ageMs = now - orderDate;
            return ageMs > maxAgeMs;
        });
        
        // Объединяем активные и недавние исторические заказы
        const beforeCount = db.orders.length;
        db.orders = [...activeOrders, ...recentHistoryOrders];
        const afterCount = db.orders.length;
        const deletedCount = beforeCount - afterCount;
        
        if (deletedCount > 0) {
            writeDB(db);
            
            // Формируем детальную информацию об удаленных заказах
            const deletedInfo = deletedOrders.map(order => 
                `#${order.id} (${order.status}) от ${new Date(order.createdAt).toLocaleDateString('ru-RU')} - ${order.name}`
            ).join('\n  ');
            
            logCleanup(`✅ Очистка истории: удалено ${deletedCount} заказов`, 'success');
            logCleanup(`  Удаленные заказы:\n  ${deletedInfo}`, 'info');
            
            // Отправляем уведомление администраторам
            notifyAdminsAboutCleanup(deletedCount);
            
            return {
                success: true,
                deletedCount,
                deletedOrders: deletedOrders.map(o => o.id)
            };
        } else {
            logCleanup(`ℹ️ Очистка истории: нет заказов для удаления`, 'info');
            return {
                success: true,
                deletedCount: 0,
                deletedOrders: []
            };
        }
    } catch (error) {
        logCleanup(`❌ Ошибка при очистке истории: ${error.message}`, 'error');
        console.error('Ошибка очистки истории:', error);
        return {
            success: false,
            error: error.message,
            deletedCount: 0
        };
    }
}

/**
 * Уведомление администраторов об очистке истории
 */
function notifyAdminsAboutCleanup(deletedCount) {
    const db = readDB();
    const admins = db.users.filter(u => u.role === 'admin');
    
    const message = `🧹 **Автоматическая очистка истории**\n\n` +
        `Удалено заказов: **${deletedCount}**\n` +
        `Заказы старше **${MAX_ORDER_AGE_DAYS}** дней\n` +
        `Время очистки: ${new Date().toLocaleString('ru-RU')}\n\n` +
        `_История заказов автоматически очищается для оптимизации работы._`;
    
    admins.forEach(admin => {
        sendTelegramMessage(admin.telegramId, message);
    });
}

/**
 * Запланированная очистка по расписанию
 */
function scheduleCleanup() {
    if (!AUTO_CLEANUP_ENABLED) {
        logCleanup('⚠️ Автоматическая очистка истории отключена', 'warning');
        return;
    }
    
    logCleanup(`🕒 Запланирована автоматическая очистка истории каждые ${CLEANUP_INTERVAL_HOURS} часов`, 'info');
    logCleanup(`   Удаление заказов старше ${MAX_ORDER_AGE_DAYS} дней`, 'info');
    
    // Запускаем немедленную проверку при старте
    setTimeout(() => {
        logCleanup('🔄 Первоначальная проверка истории...', 'info');
        cleanupOldOrders();
    }, 5000); // Через 5 секунд после запуска
    
    // Запускаем периодическую проверку
    setInterval(() => {
        const now = new Date();
        const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        
        // Проверяем, наступило ли время очистки (с погрешностью в 1 час)
        const [cleanupHour, cleanupMinute] = CLEANUP_TIME.split(':').map(Number);
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        
        // Запускаем очистку, если текущее время близко к запланированному (в пределах часа)
        if (currentHour === cleanupHour && currentMinute >= cleanupMinute - 30 && currentMinute <= cleanupMinute + 30) {
            logCleanup(`🔄 Запуск плановой очистки истории в ${currentTime}...`, 'info');
            cleanupOldOrders();
        }
    }, CLEANUP_INTERVAL_HOURS * 60 * 60 * 1000); // Проверяем каждые N часов
}

// ============================================
// API ДЛЯ УПРАВЛЕНИЯ ОЧИСТКОЙ (ТОЛЬКО ДЛЯ АДМИНОВ)
// ============================================

/**
 * Ручной запуск очистки истории
 */
function manualCleanup(req, res) {
    if (!isAdminRequest(req)) {
        res.writeHead(403);
        res.end(JSON.stringify({ error: 'Доступ запрещен' }));
        return;
    }
    
    logCleanup('👤 Ручной запуск очистки истории администратором', 'info');
    const result = cleanupOldOrders();
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
}

/**
 * Получение статистики истории заказов
 */
function getHistoryStats(req, res) {
    if (!isAdminRequest(req)) {
        res.writeHead(403);
        res.end(JSON.stringify({ error: 'Доступ запрещен' }));
        return;
    }
    
    const db = readDB();
    const now = new Date();
    const maxAgeMs = MAX_ORDER_AGE_DAYS * 24 * 60 * 60 * 1000;
    
    const historyOrders = db.orders.filter(o => o.status === 'delivered' || o.status === 'cancelled');
    const oldHistoryOrders = historyOrders.filter(o => {
        const orderDate = new Date(o.createdAt);
        return (now - orderDate) > maxAgeMs;
    });
    
    const stats = {
        totalOrders: db.orders.length,
        historyOrders: historyOrders.length,
        oldHistoryOrders: oldHistoryOrders.length,
        maxAgeDays: MAX_ORDER_AGE_DAYS,
        nextCleanupTime: CLEANUP_TIME,
        autoCleanupEnabled: AUTO_CLEANUP_ENABLED,
        oldestOrder: historyOrders.length > 0 ? 
            new Date(Math.min(...historyOrders.map(o => new Date(o.createdAt)))).toISOString() : null
    };
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(stats));
}

/**
 * Изменение настроек очистки (только для админов)
 */
function updateCleanupSettings(req, res) {
    if (!isAdminRequest(req)) {
        res.writeHead(403);
        res.end(JSON.stringify({ error: 'Доступ запрещен' }));
        return;
    }
    
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        try {
            const settings = JSON.parse(body);
            
            // Обновляем настройки (временно, для текущего сеанса)
            if (settings.maxAgeDays) {
                MAX_ORDER_AGE_DAYS = settings.maxAgeDays;
            }
            if (settings.cleanupTime) {
                CLEANUP_TIME = settings.cleanupTime;
            }
            if (settings.enabled !== undefined) {
                AUTO_CLEANUP_ENABLED = settings.enabled;
            }
            
            logCleanup(`⚙️ Настройки очистки обновлены: ${JSON.stringify(settings)}`, 'info');
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                maxAgeDays: MAX_ORDER_AGE_DAYS,
                cleanupTime: CLEANUP_TIME,
                enabled: AUTO_CLEANUP_ENABLED
            }));
        } catch (error) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
    });
}

// Инициализация базы данных
function initDB() {
    console.log(`\n📂 Проверка базы данных: ${DB_FILE}`);

    if (!fs.existsSync(DB_FILE)) {
        console.log('🆕 База данных не найдена. Создание новой...');

        const initialData = {
            categories: [
                { id: 1, name: "Классические", description: "Традиционные рецепты" },
                { id: 2, name: "Праздничные", description: "Для особых случаев" }
            ],
            cakes: [
                {
                    id: 1,
                    name: 'Медовик',
                    price: 2500,
                    weight: 1.5,
                    description: 'Классический медовый торт с нежным кремом',
                    photo: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=400',
                    available: true,
                    categoryId: 1
                },
                {
                    id: 2,
                    name: 'Наполеон',
                    price: 2800,
                    weight: 1.8,
                    description: 'Хрустящие коржи с заварным кремом',
                    photo: 'https://images.unsplash.com/photo-1464305795233-6e7c1d10f1d8?w=400',
                    available: true,
                    categoryId: 1
                },
                {
                    id: 3,
                    name: 'Красный бархат',
                    price: 3200,
                    weight: 2.0,
                    description: 'Красные коржи с сливочно-сырным кремом',
                    photo: 'https://images.unsplash.com/photo-1586788224331-947f68671cf1?w=400',
                    available: true,
                    categoryId: 2
                }
            ],
            users: [
                {
                    id: 1,
                    telegramId: ADMIN_ID,
                    username: "admin",
                    firstName: "Главный администратор",
                    role: "admin",
                    onShift: false,
                    phone: "",
                    createdAt: new Date().toISOString()
                }
            ],
            orders: [],
            cleanupLog: [], // Лог очисток
            nextCakeId: 4,
            nextOrderId: 1,
            nextCategoryId: 3,
            nextUserId: 2
        };

        try {
            fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
            console.log(`✅ База данных создана: ${DB_FILE}`);
        } catch (error) {
            console.error('❌ Ошибка создания базы данных:', error);
        }
    } else {
        console.log(`📦 База данных найдена: ${DB_FILE}`);

        // Проверяем, есть ли администратор в базе
        try {
            const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
            const adminExists = data.users.some(u => u.telegramId === ADMIN_ID && u.role === 'admin');

            if (!adminExists) {
                console.log('👑 Добавление администратора в существующую базу...');
                const newAdmin = {
                    id: data.nextUserId++,
                    telegramId: ADMIN_ID,
                    username: "admin",
                    firstName: "Главный администратор",
                    role: "admin",
                    onShift: false,
                    phone: "",
                    createdAt: new Date().toISOString()
                };
                data.users.push(newAdmin);
                fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
                console.log('✅ Администратор добавлен');
            }
        } catch (e) {
            console.error('❌ Ошибка проверки администратора:', e);
        }
    }
}

// Чтение данных из БД
function readDB() {
    try {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('❌ Ошибка чтения БД:', error);
        return { categories: [], cakes: [], users: [], orders: [], nextCakeId: 1, nextOrderId: 1, nextCategoryId: 1, nextUserId: 1 };
    }
}

// Запись данных в БД
function writeDB(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('❌ Ошибка записи БД:', error);
        return false;
    }
}

// Инициализируем БД при старте
initDB();

// ============================================
// ЗАПУСК ПЛАНОВОЙ ОЧИСТКИ
// ============================================
scheduleCleanup();

// Вспомогательная функция для отправки сообщений в Telegram
function sendTelegramMessage(chatId, text, parseMode = 'Markdown') {
    if (!chatId) {
        console.log('❌ Нет chatId для отправки сообщения');
        return;
    }

    if (!BOT_TOKEN) {
        console.error('❌ Нет BOT_TOKEN для отправки сообщений');
        return;
    }

    const postData = JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: parseMode
    });

    const options = {
        hostname: 'api.telegram.org',
        path: `/bot${BOT_TOKEN}/sendMessage`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    const req = https.request(options, (apiRes) => {
        let data = '';
        apiRes.on('data', chunk => data += chunk);
        apiRes.on('end', () => {
            try {
                const response = JSON.parse(data);
                if (!response.ok) {
                    console.error('❌ Ошибка Telegram API:', response.description);
                } else {
                    console.log(`✅ Сообщение отправлено в чат ${chatId}`);
                }
            } catch (e) {
                console.error('❌ Ошибка парсинга ответа Telegram:', e);
            }
        });
    });

    req.on('error', (error) => {
        console.error('❌ Ошибка отправки в Telegram:', error);
    });

    req.write(postData);
    req.end();
}

// Получение администратора на смене
function getAdminOnShift(users) {
    return users.find(u => u.role === 'admin' && u.onShift === true);
}

// Получение всех администраторов
function getAllAdmins(users) {
    return users.filter(u => u.role === 'admin');
}

// Получение курьеров на смене
function getCouriersOnShift(users) {
    return users.filter(u => u.role === 'courier' && u.onShift === true);
}

// Получение пользователя по telegramId
function findUserByTelegramId(users, telegramId) {
    return users.find(u => u.telegramId === telegramId);
}

// Создание или обновление пользователя (для покупателей)
async function getOrCreateUser(telegramId, userData) {
    const db = readDB();
    let user = findUserByTelegramId(db.users, telegramId);

    if (!user) {
        // Создаем нового покупателя
        const newUser = {
            id: db.nextUserId++,
            telegramId: telegramId,
            username: userData.username || '',
            firstName: userData.first_name || 'Покупатель',
            role: 'customer',
            onShift: false,
            phone: '',
            createdAt: new Date().toISOString()
        };
        db.users.push(newUser);
        writeDB(db);
        return newUser;
    }
    return user;
}

// Отправка уведомлений о новом заказе
function notifyNewOrder(orderData, users) {
    const adminOnShift = getAdminOnShift(users);
    const admins = getAllAdmins(users);

    const cakesList = orderData.cart.map(item =>
        `🍰 ${item.name} - ${item.price} ₽ (${item.weight} кг)`
    ).join('\n');

    const orderMessage =
        `📩 **НОВЫЙ ЗАКАЗ**\n\n` +
        `🍰 **Торты:**\n${cakesList}\n` +
        `💰 **Итого:** ${orderData.totalPrice} ₽\n\n` +
        `👤 **Имя:** ${orderData.name}\n` +
        `🆔 **Username:** ${orderData.username ? '@' + orderData.username : 'нет'}\n` +
        `📱 **Телефон:** ${orderData.phone}\n` +
        `📅 **Дата доставки:** ${orderData.deliveryDate}\n` +
        `⏰ **Время доставки:** ${orderData.deliveryTime}\n` +
        `📝 **Пожелания:** ${orderData.wish || 'Без пожеланий'}\n` +
        `🆔 **User ID:** ${orderData.userId}\n` +
        `📅 **Дата заказа:** ${new Date().toLocaleString('ru-RU')}\n\n` +
        `👑 **Управление заказами:** https://${SITE_DOMAIN}/admin`;

    // Отправляем админу на смене или всем админам
    if (adminOnShift) {
        sendTelegramMessage(adminOnShift.telegramId, orderMessage);
    } else {
        admins.forEach(admin => sendTelegramMessage(admin.telegramId, orderMessage));
    }

    // Отправляем подтверждение покупателю
    const customerMessage =
        `✅ **Ваш заказ принят!**\n\n` +
        `Спасибо за заказ в *ButterBakeryCafe* ❤️\n\n` +
        `🍰 **Торты:**\n${cakesList}\n` +
        `💰 **Сумма:** ${orderData.totalPrice} ₽\n` +
        `📅 **Дата доставки:** ${orderData.deliveryDate}\n` +
        `⏰ **Время доставки:** ${orderData.deliveryTime}\n` +
        `📍 **Адрес:** ${orderData.address}\n\n` +
        `Мы свяжемся с вами для подтверждения.`;

    sendTelegramMessage(orderData.userId, customerMessage);
}

// Уведомление о назначении курьера
function notifyOrderAssigned(order, courier, users) {
    const adminOnShift = getAdminOnShift(users);

    // Курьеру
    const courierMessage =
        `🚚 **Вам назначен заказ #${order.id}**\n\n` +
        `👤 **Клиент:** ${order.name}\n` +
        `📱 **Телефон:** ${order.phone}\n` +
        `📍 **Адрес:** ${order.address}\n` +
        `📅 **Доставка:** ${order.deliveryDate} ${order.deliveryTime}\n` +
        `📝 **Пожелания:** ${order.wish || 'Без пожеланий'}`;

    sendTelegramMessage(courier.telegramId, courierMessage);

    // Клиенту
    const customerMessage =
        `🚚 **Ваш заказ #${order.id} передан курьеру!**\n\n` +
        `Курьер уже в пути. Ожидайте доставку в ближайшее время.`;

    sendTelegramMessage(order.userId, customerMessage);

    // Администратору на смене
    if (adminOnShift) {
        const adminMessage =
            `📋 **Заказ #${order.id} назначен курьеру**\n\n` +
            `🚴‍♂️ **Курьер:** ${courier.firstName} (@${courier.username})\n` +
            `📱 **Телефон курьера:** ${courier.phone || 'не указан'}`;

        sendTelegramMessage(adminOnShift.telegramId, adminMessage);
    }
}

// Уведомление о доставке
function notifyOrderDelivered(order, users) {
    const adminOnShift = getAdminOnShift(users);

    // Клиенту
    const customerMessage =
        `🎉 **Ваш заказ #${order.id} доставлен!**\n\n` +
        `Спасибо, что выбрали *ButterBakeryCafe*! Ждём вас снова ❤️`;

    sendTelegramMessage(order.userId, customerMessage);

    // Администратору на смене
    if (adminOnShift) {
        const adminMessage =
            `✅ **Заказ #${order.id} доставлен**\n\n` +
            `Клиент уведомлен.`;

        sendTelegramMessage(adminOnShift.telegramId, adminMessage);
    }
}

const server = http.createServer((req, res) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // Функция для проверки авторизации (упрощенная)
    const isAdminRequest = (req) => {
        // В реальном проекте здесь должна быть проверка подписи Telegram
        return true; // Для теста разрешаем все
    };

    // ============================================
    // API ДЛЯ УПРАВЛЕНИЯ ОЧИСТКОЙ ИСТОРИИ
    // ============================================

    // Ручной запуск очистки истории
    if (pathname === '/api/admin/cleanup' && req.method === 'POST') {
        manualCleanup(req, res);
        return;
    }

    // Получение статистики истории
    if (pathname === '/api/admin/cleanup/stats' && req.method === 'GET') {
        getHistoryStats(req, res);
        return;
    }

    // Обновление настроек очистки
    if (pathname === '/api/admin/cleanup/settings' && req.method === 'PUT') {
        updateCleanupSettings(req, res);
        return;
    }

    // Получение лога очисток
    if (pathname === '/api/admin/cleanup/log' && req.method === 'GET') {
        if (!isAdminRequest(req)) {
            res.writeHead(403);
            res.end(JSON.stringify({ error: 'Доступ запрещен' }));
            return;
        }

        try {
            const logContent = fs.readFileSync(CLEANUP_LOG_FILE, 'utf8');
            const lines = logContent.split('\n').filter(line => line.trim());
            const lastEntries = lines.slice(-100); // Последние 100 записей
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ log: lastEntries }));
        } catch (error) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ log: [], message: 'Лог-файл не найден' }));
        }
        return;
    }

    // ============================================
    // API ДЛЯ ПОЛЬЗОВАТЕЛЕЙ
    // ============================================

    // Регистрация/получение пользователя
    if (pathname === '/api/user' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { telegramId, userData } = JSON.parse(body);
                const user = await getOrCreateUser(telegramId, userData);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, user }));
            } catch (error) {
                console.error('❌ Ошибка регистрации пользователя:', error);
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'Ошибка сервера' }));
            }
        });
        return;
    }

    // Проверка прав администратора
    if (pathname === '/api/check-admin' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { userId } = JSON.parse(body);
                const db = readDB();
                const user = db.users.find(u => u.telegramId === userId);
                const isAdminUser = user && user.role === 'admin';
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ isAdmin: isAdminUser }));
            } catch (error) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
        });
        return;
    }

    // ============================================
    // API ДЛЯ КАТЕГОРИЙ (публичные)
    // ============================================

    if (pathname === '/api/categories' && req.method === 'GET') {
        const db = readDB();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(db.categories));
        return;
    }

    // ============================================
    // API ДЛЯ ТОРТОВ (публичные)
    // ============================================

    if (pathname === '/api/cakes' && req.method === 'GET') {
        const db = readDB();
        const categoryId = parsedUrl.query.categoryId ? parseInt(parsedUrl.query.categoryId) : null;

        let availableCakes = db.cakes.filter(c => c.available);

        if (categoryId) {
            availableCakes = availableCakes.filter(c => c.categoryId === categoryId);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(availableCakes));
        return;
    }

    // ============================================
    // API ДЛЯ ЗАКАЗОВ (клиент)
    // ============================================

    if (pathname === '/api/orders' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const orderData = JSON.parse(body);
                const db = readDB();

                const newOrder = {
                    id: db.nextOrderId++,
                    ...orderData,
                    status: 'active',
                    courierId: null,
                    createdAt: new Date().toISOString()
                };

                db.orders.push(newOrder);
                writeDB(db);

                // Отправляем уведомления
                notifyNewOrder(newOrder, db.users);

                res.writeHead(201, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, orderId: newOrder.id }));

            } catch (error) {
                console.error('❌ Ошибка создания заказа:', error);
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'Ошибка сервера' }));
            }
        });
        return;
    }

    // ============================================
    // API ДЛЯ ЗАГРУЗКИ ФОТО (админ)
    // ============================================

    if (pathname === '/api/upload' && req.method === 'POST') {
        if (!isAdminRequest(req)) {
            res.writeHead(403);
            res.end(JSON.stringify({ error: 'Доступ запрещен' }));
            return;
        }

        const boundary = req.headers['content-type'].split('boundary=')[1];
        let body = [];

        req.on('data', chunk => {
            body.push(chunk);
        }).on('end', () => {
            try {
                const buffer = Buffer.concat(body);
                const text = buffer.toString('binary');
                const filenameMatch = text.match(/filename="(.+?)"/);
                const filename = filenameMatch ? filenameMatch[1] : `photo_${Date.now()}.jpg`;

                const fileDataStart = buffer.indexOf('\r\n\r\n') + 4;
                const fileDataEnd = buffer.lastIndexOf('\r\n--' + boundary);

                if (fileDataStart !== -1 && fileDataEnd !== -1) {
                    const fileData = buffer.slice(fileDataStart, fileDataEnd);
                    const ext = path.extname(filename) || '.jpg';
                    const newFilename = `cake_${Date.now()}${ext}`;
                    const filePath = path.join(UPLOAD_DIR, newFilename);

                    fs.writeFileSync(filePath, fileData);

                    // URL для доступа к файлу (оставляем /uploads/ для совместимости)
                    const fileUrl = `/uploads/${newFilename}`;

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: true,
                        url: fileUrl,
                        filename: newFilename
                    }));
                } else {
                    throw new Error('Не удалось извлечь данные файла');
                }
            } catch (error) {
                console.error('❌ Ошибка загрузки файла:', error);
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'Ошибка загрузки файла' }));
            }
        });
        return;
    }

    // ============================================
    // API ДЛЯ АДМИНИСТРИРОВАНИЯ КАТЕГОРИЙ
    // ============================================

    // Получить все категории (админ)
    if (pathname === '/api/admin/categories' && req.method === 'GET') {
        if (!isAdminRequest(req)) {
            res.writeHead(403);
            res.end(JSON.stringify({ error: 'Доступ запрещен' }));
            return;
        }

        const db = readDB();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(db.categories));
        return;
    }

    // Создать категорию
    if (pathname === '/api/admin/categories' && req.method === 'POST') {
        if (!isAdminRequest(req)) {
            res.writeHead(403);
            res.end(JSON.stringify({ error: 'Доступ запрещен' }));
            return;
        }

        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { name, description } = JSON.parse(body);
                const db = readDB();

                const newCategory = {
                    id: db.nextCategoryId++,
                    name,
                    description: description || ''
                };

                db.categories.push(newCategory);
                writeDB(db);

                res.writeHead(201, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(newCategory));
            } catch (error) {
                console.error('❌ Ошибка создания категории:', error);
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'Ошибка сервера' }));
            }
        });
        return;
    }

    // Обновить категорию
    if (pathname.startsWith('/api/admin/categories/') && req.method === 'PUT') {
        if (!isAdminRequest(req)) {
            res.writeHead(403);
            res.end(JSON.stringify({ error: 'Доступ запрещен' }));
            return;
        }

        const categoryId = parseInt(pathname.split('/').pop());
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { name, description } = JSON.parse(body);
                const db = readDB();

                const categoryIndex = db.categories.findIndex(c => c.id === categoryId);
                if (categoryIndex === -1) {
                    res.writeHead(404);
                    res.end(JSON.stringify({ error: 'Категория не найдена' }));
                    return;
                }

                db.categories[categoryIndex] = {
                    ...db.categories[categoryIndex],
                    name,
                    description: description || ''
                };

                writeDB(db);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(db.categories[categoryIndex]));
            } catch (error) {
                console.error('❌ Ошибка обновления категории:', error);
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'Ошибка сервера' }));
            }
        });
        return;
    }

    // Удалить категорию
    if (pathname.startsWith('/api/admin/categories/') && req.method === 'DELETE') {
        if (!isAdminRequest(req)) {
            res.writeHead(403);
            res.end(JSON.stringify({ error: 'Доступ запрещен' }));
            return;
        }

        const categoryId = parseInt(pathname.split('/').pop());
        const db = readDB();

        // Проверяем, есть ли товары в этой категории
        const cakesInCategory = db.cakes.some(c => c.categoryId === categoryId);
        if (cakesInCategory) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Нельзя удалить категорию, в которой есть товары' }));
            return;
        }

        db.categories = db.categories.filter(c => c.id !== categoryId);
        writeDB(db);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
    }

    // ============================================
    // API ДЛЯ АДМИНИСТРИРОВАНИЯ ТОРТОВ
    // ============================================

    // Получить все торты (админ)
    if (pathname === '/api/admin/cakes' && req.method === 'GET') {
        if (!isAdminRequest(req)) {
            res.writeHead(403);
            res.end(JSON.stringify({ error: 'Доступ запрещен' }));
            return;
        }

        const db = readDB();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(db.cakes));
        return;
    }

    // Добавить новый торт
    if (pathname === '/api/admin/cakes' && req.method === 'POST') {
        if (!isAdminRequest(req)) {
            res.writeHead(403);
            res.end(JSON.stringify({ error: 'Доступ запрещен' }));
            return;
        }

        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const cakeData = JSON.parse(body);
                const db = readDB();

                // Проверяем, что категория существует
                const category = db.categories.find(c => c.id === cakeData.categoryId);
                if (!category) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'Указанная категория не существует' }));
                    return;
                }

                const newCake = {
                    id: db.nextCakeId++,
                    ...cakeData,
                    available: true
                };

                db.cakes.push(newCake);
                writeDB(db);

                res.writeHead(201, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(newCake));
            } catch (error) {
                console.error('❌ Ошибка добавления торта:', error);
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'Ошибка сервера' }));
            }
        });
        return;
    }

    // Обновить торт
    if (pathname.startsWith('/api/admin/cakes/') && req.method === 'PUT') {
        if (!isAdminRequest(req)) {
            res.writeHead(403);
            res.end(JSON.stringify({ error: 'Доступ запрещен' }));
            return;
        }

        const cakeId = parseInt(pathname.split('/').pop());
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const updates = JSON.parse(body);
                const db = readDB();

                const cakeIndex = db.cakes.findIndex(c => c.id === cakeId);
                if (cakeIndex === -1) {
                    res.writeHead(404);
                    res.end(JSON.stringify({ error: 'Торт не найден' }));
                    return;
                }

                // Если обновляется категория, проверяем её существование
                if (updates.categoryId) {
                    const category = db.categories.find(c => c.id === updates.categoryId);
                    if (!category) {
                        res.writeHead(400);
                        res.end(JSON.stringify({ error: 'Указанная категория не существует' }));
                        return;
                    }
                }

                db.cakes[cakeIndex] = { ...db.cakes[cakeIndex], ...updates };
                writeDB(db);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(db.cakes[cakeIndex]));
            } catch (error) {
                console.error('❌ Ошибка обновления торта:', error);
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'Ошибка сервера' }));
            }
        });
        return;
    }

    // Удалить торт
    if (pathname.startsWith('/api/admin/cakes/') && req.method === 'DELETE') {
        if (!isAdminRequest(req)) {
            res.writeHead(403);
            res.end(JSON.stringify({ error: 'Доступ запрещен' }));
            return;
        }

        const cakeId = parseInt(pathname.split('/').pop());
        const db = readDB();

        const cake = db.cakes.find(c => c.id === cakeId);
        if (cake && cake.photo && cake.photo.startsWith('/uploads/')) {
            // Извлекаем имя файла из URL
            const filename = path.basename(cake.photo);
            const filePath = path.join(UPLOAD_DIR, filename);

            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`🗑️ Удален файл: ${filename}`);
            }
        }

        db.cakes = db.cakes.filter(c => c.id !== cakeId);
        writeDB(db);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
    }

    // ============================================
    // API ДЛЯ УПРАВЛЕНИЯ ПОЛЬЗОВАТЕЛЯМИ (АДМИН)
    // ============================================

    // Получить всех пользователей (только админы и курьеры для UI)
    if (pathname === '/api/admin/users' && req.method === 'GET') {
        if (!isAdminRequest(req)) {
            res.writeHead(403);
            res.end(JSON.stringify({ error: 'Доступ запрещен' }));
            return;
        }

        const db = readDB();
        // Возвращаем только админов и курьеров для отображения в UI
        const staffUsers = db.users.filter(u => u.role === 'admin' || u.role === 'courier');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(staffUsers));
        return;
    }

    // Получить всех пользователей (включая customers, для внутреннего использования)
    if (pathname === '/api/admin/all-users' && req.method === 'GET') {
        if (!isAdminRequest(req)) {
            res.writeHead(403);
            res.end(JSON.stringify({ error: 'Доступ запрещен' }));
            return;
        }

        const db = readDB();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(db.users));
        return;
    }

    // Получить список администраторов
    if (pathname === '/api/admin/admins' && req.method === 'GET') {
        if (!isAdminRequest(req)) {
            res.writeHead(403);
            res.end(JSON.stringify({ error: 'Доступ запрещен' }));
            return;
        }

        const db = readDB();
        const admins = db.users.filter(u => u.role === 'admin');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(admins));
        return;
    }

    // Получить список курьеров
    if (pathname === '/api/admin/couriers' && req.method === 'GET') {
        if (!isAdminRequest(req)) {
            res.writeHead(403);
            res.end(JSON.stringify({ error: 'Доступ запрещен' }));
            return;
        }

        const db = readDB();
        const couriers = db.users.filter(u => u.role === 'courier');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(couriers));
        return;
    }

    // Получить список курьеров на смене
    if (pathname === '/api/admin/couriers/on-shift' && req.method === 'GET') {
        if (!isAdminRequest(req)) {
            res.writeHead(403);
            res.end(JSON.stringify({ error: 'Доступ запрещен' }));
            return;
        }

        const db = readDB();
        const couriersOnShift = db.users.filter(u => u.role === 'courier' && u.onShift === true);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(couriersOnShift));
        return;
    }

    // Получить администратора на смене
    if (pathname === '/api/admin/admins/on-shift' && req.method === 'GET') {
        if (!isAdminRequest(req)) {
            res.writeHead(403);
            res.end(JSON.stringify({ error: 'Доступ запрещен' }));
            return;
        }

        const db = readDB();
        const adminOnShift = db.users.find(u => u.role === 'admin' && u.onShift === true);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(adminOnShift || null));
        return;
    }

    // Создать нового пользователя (админа/курьера)
    if (pathname === '/api/admin/users' && req.method === 'POST') {
        if (!isAdminRequest(req)) {
            res.writeHead(403);
            res.end(JSON.stringify({ error: 'Доступ запрещен' }));
            return;
        }

        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { telegramId, username, firstName, role, phone } = JSON.parse(body);
                const db = readDB();

                // Проверяем, что такого пользователя еще нет
                const existingUser = db.users.find(u => u.telegramId === telegramId);
                if (existingUser) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'Пользователь с таким Telegram ID уже существует' }));
                    return;
                }

                // Проверяем допустимость роли
                if (role !== 'admin' && role !== 'courier') {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'Недопустимая роль' }));
                    return;
                }

                const newUser = {
                    id: db.nextUserId++,
                    telegramId,
                    username: username || '',
                    firstName: firstName || 'Новый пользователь',
                    role,
                    onShift: false,
                    phone: phone || '',
                    createdAt: new Date().toISOString()
                };

                db.users.push(newUser);
                writeDB(db);

                res.writeHead(201, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(newUser));
            } catch (error) {
                console.error('❌ Ошибка создания пользователя:', error);
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'Ошибка сервера' }));
            }
        });
        return;
    }

    // Обновить пользователя
    if (pathname.startsWith('/api/admin/users/') && req.method === 'PUT') {
        if (!isAdminRequest(req)) {
            res.writeHead(403);
            res.end(JSON.stringify({ error: 'Доступ запрещен' }));
            return;
        }

        const userId = parseInt(pathname.split('/').pop());
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const updates = JSON.parse(body);
                const db = readDB();

                const userIndex = db.users.findIndex(u => u.id === userId);
                if (userIndex === -1) {
                    res.writeHead(404);
                    res.end(JSON.stringify({ error: 'Пользователь не найден' }));
                    return;
                }

                // Не даем изменить роль последнего администратора, если он один
                if (updates.role && updates.role !== 'admin') {
                    const adminsCount = db.users.filter(u => u.role === 'admin').length;
                    if (adminsCount === 1 && db.users[userIndex].role === 'admin') {
                        res.writeHead(400);
                        res.end(JSON.stringify({ error: 'Нельзя изменить роль последнего администратора' }));
                        return;
                    }
                }

                db.users[userIndex] = { ...db.users[userIndex], ...updates };
                writeDB(db);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(db.users[userIndex]));
            } catch (error) {
                console.error('❌ Ошибка обновления пользователя:', error);
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'Ошибка сервера' }));
            }
        });
        return;
    }

    // Удалить пользователя
    if (pathname.startsWith('/api/admin/users/') && req.method === 'DELETE') {
        if (!isAdminRequest(req)) {
            res.writeHead(403);
            res.end(JSON.stringify({ error: 'Доступ запрещен' }));
            return;
        }

        const userId = parseInt(pathname.split('/').pop());
        const db = readDB();

        const userToDelete = db.users.find(u => u.id === userId);
        if (!userToDelete) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Пользователь не найден' }));
            return;
        }

        // Защита от удаления последнего администратора
        if (userToDelete.role === 'admin') {
            const adminsCount = db.users.filter(u => u.role === 'admin').length;
            if (adminsCount === 1) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Нельзя удалить последнего администратора' }));
                return;
            }
        }

        db.users = db.users.filter(u => u.id !== userId);
        writeDB(db);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
    }

    // Переключение статуса "На смене"
    if (pathname.startsWith('/api/admin/users/') && req.method === 'POST' && pathname.endsWith('/toggle-shift')) {
        if (!isAdminRequest(req)) {
            res.writeHead(403);
            res.end(JSON.stringify({ error: 'Доступ запрещен' }));
            return;
        }

        const userId = parseInt(pathname.split('/').reverse()[1]);
        const db = readDB();

        const userIndex = db.users.findIndex(u => u.id === userId);
        if (userIndex === -1) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Пользователь не найден' }));
            return;
        }

        db.users[userIndex].onShift = !db.users[userIndex].onShift;
        writeDB(db);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ onShift: db.users[userIndex].onShift }));
        return;
    }

    // ============================================
    // API ДЛЯ УПРАВЛЕНИЯ ЗАКАЗАМИ (АДМИН)
    // ============================================

    // Получить все заказы (админ)
    if (pathname === '/api/admin/orders' && req.method === 'GET') {
        if (!isAdminRequest(req)) {
            res.writeHead(403);
            res.end(JSON.stringify({ error: 'Доступ запрещен' }));
            return;
        }

        const db = readDB();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(db.orders));
        return;
    }

    // Получить активные заказы (active и assigned_to_courier)
    if (pathname === '/api/admin/orders/active' && req.method === 'GET') {
        if (!isAdminRequest(req)) {
            res.writeHead(403);
            res.end(JSON.stringify({ error: 'Доступ запрещен' }));
            return;
        }

        const db = readDB();
        const activeOrders = db.orders.filter(o => o.status === 'active' || o.status === 'assigned_to_courier');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(activeOrders));
        return;
    }

    // Получить историю заказов (delivered и cancelled)
    if (pathname === '/api/admin/orders/history' && req.method === 'GET') {
        if (!isAdminRequest(req)) {
            res.writeHead(403);
            res.end(JSON.stringify({ error: 'Доступ запрещен' }));
            return;
        }

        const db = readDB();
        const historyOrders = db.orders.filter(o => o.status === 'delivered' || o.status === 'cancelled');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(historyOrders));
        return;
    }

    // Обновить статус заказа
    if (pathname.startsWith('/api/admin/orders/') && req.method === 'PUT') {
        if (!isAdminRequest(req)) {
            res.writeHead(403);
            res.end(JSON.stringify({ error: 'Доступ запрещен' }));
            return;
        }

        const orderId = parseInt(pathname.split('/').pop());
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const updates = JSON.parse(body);
                const db = readDB();

                const orderIndex = db.orders.findIndex(o => o.id === orderId);
                if (orderIndex === -1) {
                    res.writeHead(404);
                    res.end(JSON.stringify({ error: 'Заказ не найден' }));
                    return;
                }

                const oldStatus = db.orders[orderIndex].status;
                const newStatus = updates.status;

                db.orders[orderIndex] = { ...db.orders[orderIndex], ...updates };
                writeDB(db);

                // Отправляем уведомления при смене статуса на delivered
                if (oldStatus !== 'delivered' && newStatus === 'delivered') {
                    notifyOrderDelivered(db.orders[orderIndex], db.users);
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(db.orders[orderIndex]));
            } catch (error) {
                console.error('❌ Ошибка обновления заказа:', error);
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'Ошибка сервера' }));
            }
        });
        return;
    }

    // Назначить курьера на заказ
    if (pathname.startsWith('/api/admin/orders/') && req.method === 'POST' && pathname.endsWith('/assign-courier')) {
        if (!isAdminRequest(req)) {
            res.writeHead(403);
            res.end(JSON.stringify({ error: 'Доступ запрещен' }));
            return;
        }

        const orderId = parseInt(pathname.split('/').reverse()[1]);
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { courierId } = JSON.parse(body);
                const db = readDB();

                const orderIndex = db.orders.findIndex(o => o.id === orderId);
                if (orderIndex === -1) {
                    res.writeHead(404);
                    res.end(JSON.stringify({ error: 'Заказ не найден' }));
                    return;
                }

                const courier = db.users.find(u => u.id === courierId && u.role === 'courier');
                if (!courier) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'Курьер не найден' }));
                    return;
                }

                db.orders[orderIndex].courierId = courierId;
                db.orders[orderIndex].status = 'assigned_to_courier';
                writeDB(db);

                // Отправляем уведомления
                notifyOrderAssigned(db.orders[orderIndex], courier, db.users);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(db.orders[orderIndex]));
            } catch (error) {
                console.error('❌ Ошибка назначения курьера:', error);
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'Ошибка сервера' }));
            }
        });
        return;
    }

    // ============================================
    // РАЗДАЧА СТАТИЧЕСКИХ ФАЙЛОВ
    // ============================================

    let filePath;

    // Сначала проверяем, не запрашивают ли файл из uploads
    if (pathname.startsWith('/uploads/')) {
        // Извлекаем имя файла из пути
        const filename = path.basename(pathname);
        filePath = path.join(UPLOAD_DIR, filename);
    }
    else if (pathname === '/') {
        filePath = path.join(__dirname, 'public', 'index.html');
    } else if (pathname === '/admin') {
        filePath = path.join(__dirname, 'public', 'admin.html');
    } else {
        filePath = path.join(__dirname, 'public', pathname);
    }

    const extname = path.extname(filePath);
    const contentType = mimeTypes[extname] || 'text/plain';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                // Если файл не найден в uploads, пробуем в public (для обратной совместимости)
                if (pathname.startsWith('/uploads/')) {
                    // Пробуем найти в старой папке public/uploads
                    const oldPath = path.join(__dirname, 'public', pathname);
                    fs.readFile(oldPath, (err, oldContent) => {
                        if (!err) {
                            res.writeHead(200, { 'Content-Type': contentType });
                            res.end(oldContent, 'utf-8');
                        } else {
                            res.writeHead(404);
                            res.end('Файл не найден');
                        }
                    });
                } else {
                    fs.readFile(path.join(__dirname, 'public', 'index.html'), (err, content) => {
                        if (err) {
                            res.writeHead(404);
                            res.end('Файл не найден');
                        } else {
                            res.writeHead(200, { 'Content-Type': 'text/html' });
                            res.end(content, 'utf-8');
                        }
                    });
                }
            } else {
                res.writeHead(500);
                res.end(`Ошибка сервера: ${error.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 ==========================================`);
    console.log(`✅ Mini App сервер запущен на порту ${PORT}`);
    console.log(`📱 Главная страница: http://localhost:${PORT}`);
    console.log(`👑 Админ-панель: http://localhost:${PORT}/admin`);
    console.log(`💾 Файл базы данных: ${DB_FILE}`);
    console.log(`📸 Загрузки сохраняются в: ${UPLOAD_DIR}`);
    console.log(`🌐 Режим: ${IS_PRODUCTION ? 'PRODUCTION' : 'DEVELOPMENT'}`);
    console.log(`=============================================`);
    console.log(`🧹 Автоматическая очистка истории:`);
    console.log(`   Статус: ${AUTO_CLEANUP_ENABLED ? 'ВКЛЮЧЕНА' : 'ОТКЛЮЧЕНА'}`);
    console.log(`   Удаление заказов старше: ${MAX_ORDER_AGE_DAYS} дней`);
    console.log(`   Время очистки: ${CLEANUP_TIME}`);
    console.log(`   Проверка каждые: ${CLEANUP_INTERVAL_HOURS} ч.`);
    console.log(`=============================================\n`);
});
