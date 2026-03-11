// datepicker.js - Логика для выбора даты и времени

let currentDate = new Date();
let selectedDate = null;
let selectedHour = null;
let selectedMinute = null;
let currentMonth = currentDate.getMonth();
let currentYear = currentDate.getFullYear();

// Дни недели
const weekdays = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];

// Месяца
const months = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

// ============================================
// ФУНКЦИИ ДЛЯ ДАТЫ
// ============================================

// Открыть календарь
function openDatePicker() {
    renderCalendar();
    document.getElementById('datePickerModal').classList.add('open');
}

// Закрыть календарь
function closeDatePicker() {
    document.getElementById('datePickerModal').classList.remove('open');
}

// Переключить месяц
function changeMonth(direction) {
    currentMonth += direction;
    
    if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
    } else if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
    }
    
    renderCalendar();
}

// Обновить отображение текущего месяца
function updateMonthDisplay() {
    document.getElementById('currentMonth').textContent = 
        `${months[currentMonth]} ${currentYear}`;
}

// Получить количество дней в месяце
function getDaysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
}

// Получить первый день месяца (0 - ПН, 6 - ВС)
function getFirstDayOfMonth(year, month) {
    const day = new Date(year, month, 1).getDay();
    // Переводим (0 - ВС) в (6 - ВС, 0 - ПН)
    return day === 0 ? 6 : day - 1;
}

// Рендер календаря
function renderCalendar() {
    const calendarGrid = document.getElementById('calendarGrid');
    const daysInMonth = getDaysInMonth(currentYear, currentMonth);
    const firstDay = getFirstDayOfMonth(currentYear, currentMonth);
    
    updateMonthDisplay();
    
    let html = '';
    
    // Пустые ячейки до первого дня месяца
    for (let i = 0; i < firstDay; i++) {
        html += '<div class="calendar-day disabled"></div>';
    }
    
    // Ячейки с днями
    for (let day = 1; day <= daysInMonth; day++) {
        const isToday = isCurrentDay(day);
        const isSelected = selectedDate && 
                          selectedDate.getDate() === day && 
                          selectedDate.getMonth() === currentMonth && 
                          selectedDate.getFullYear() === currentYear;
        
        const todayClass = isToday ? 'today' : '';
        const selectedClass = isSelected ? 'selected' : '';
        
        html += `<div class="calendar-day ${todayClass} ${selectedClass}" onclick="selectDate(${day})">${day}</div>`;
    }
    
    calendarGrid.innerHTML = html;
}

// Проверка, является ли день текущим
function isCurrentDay(day) {
    const today = new Date();
    return today.getDate() === day && 
           today.getMonth() === currentMonth && 
           today.getFullYear() === currentYear;
}

// Выбрать дату
function selectDate(day) {
    // Убираем выделение со всех дней
    document.querySelectorAll('.calendar-day').forEach(el => {
        el.classList.remove('selected');
    });
    
    // Выделяем выбранный день
    event.target.classList.add('selected');
    
    // Сохраняем выбранную дату
    selectedDate = new Date(currentYear, currentMonth, day);
}

// Подтвердить выбор даты
function confirmDate() {
    if (selectedDate) {
        const day = selectedDate.getDate().toString().padStart(2, '0');
        const month = (selectedDate.getMonth() + 1).toString().padStart(2, '0');
        const year = selectedDate.getFullYear();
        
        document.getElementById('deliveryDate').value = `${day}.${month}.${year}`;
        closeDatePicker();
    } else {
        showToast('Выберите дату', 'warning');
    }
}

// Сбросить дату
function resetDate() {
    selectedDate = null;
    document.getElementById('deliveryDate').value = '';
    
    // Убираем выделение со всех дней
    document.querySelectorAll('.calendar-day').forEach(el => {
        el.classList.remove('selected');
    });
    
    closeDatePicker();
}

// ============================================
// ФУНКЦИИ ДЛЯ ВРЕМЕНИ (TIME PICKER)
// ============================================

// Открыть выбор времени
function openTimePicker() {
    renderTimeSelector();
    updateSelectedTimeDisplay();
    document.getElementById('timePickerModal').classList.add('open');
}

// Закрыть выбор времени
function closeTimePicker() {
    document.getElementById('timePickerModal').classList.remove('open');
}

// Рендер выбора часов и минут
function renderTimeSelector() {
    renderHours();
    renderMinutes();
}

// Рендер часов (00-23)
function renderHours() {
    const hourSelector = document.getElementById('hourSelector');
    let html = '';
    
    for (let hour = 0; hour < 24; hour++) {
        const hourStr = hour.toString().padStart(2, '0');
        const isSelected = selectedHour === hour;
        const selectedClass = isSelected ? 'selected' : '';
        
        html += `<div class="time-unit ${selectedClass}" onclick="selectHour(${hour})">${hourStr}</div>`;
    }
    
    hourSelector.innerHTML = html;
}

// Рендер минут (00, 15, 30, 45 - интервалы)
function renderMinutes() {
    const minuteSelector = document.getElementById('minuteSelector');
    const minutes = ['00', '15', '30', '45'];
    let html = '';
    
    minutes.forEach((minute, index) => {
        const minuteNum = index * 15;
        const isSelected = selectedMinute === minuteNum;
        const selectedClass = isSelected ? 'selected' : '';
        
        html += `<div class="time-unit ${selectedClass}" onclick="selectMinute(${minuteNum})">${minute}</div>`;
    });
    
    minuteSelector.innerHTML = html;
}

// Выбрать час
function selectHour(hour) {
    selectedHour = hour;
    
    // Убираем выделение со всех часов
    document.querySelectorAll('#hourSelector .time-unit').forEach(el => {
        el.classList.remove('selected');
    });
    
    // Выделяем выбранный час
    event.target.classList.add('selected');
    
    updateSelectedTimeDisplay();
}

// Выбрать минуты
function selectMinute(minute) {
    selectedMinute = minute;
    
    // Убираем выделение со всех минут
    document.querySelectorAll('#minuteSelector .time-unit').forEach(el => {
        el.classList.remove('selected');
    });
    
    // Выделяем выбранные минуты
    event.target.classList.add('selected');
    
    updateSelectedTimeDisplay();
}

// Обновить отображение выбранного времени
function updateSelectedTimeDisplay() {
    const display = document.getElementById('selectedTimeDisplay');
    
    if (selectedHour !== null && selectedMinute !== null) {
        const hourStr = selectedHour.toString().padStart(2, '0');
        const minuteStr = selectedMinute.toString().padStart(2, '0');
        display.textContent = `${hourStr}:${minuteStr}`;
    } else if (selectedHour !== null) {
        const hourStr = selectedHour.toString().padStart(2, '0');
        display.textContent = `${hourStr}:--`;
    } else if (selectedMinute !== null) {
        const minuteStr = selectedMinute.toString().padStart(2, '0');
        display.textContent = `--:${minuteStr}`;
    } else {
        display.textContent = '--:--';
    }
}

// Подтвердить выбор времени
function confirmTime() {
    if (selectedHour !== null && selectedMinute !== null) {
        const hourStr = selectedHour.toString().padStart(2, '0');
        const minuteStr = selectedMinute.toString().padStart(2, '0');
        document.getElementById('deliveryTime').value = `${hourStr}:${minuteStr}`;
        closeTimePicker();
    } else {
        showToast('Выберите часы и минуты', 'warning');
    }
}

// Сбросить время
function resetTime() {
    selectedHour = null;
    selectedMinute = null;
    document.getElementById('deliveryTime').value = '';
    
    // Убираем выделение со всех элементов
    document.querySelectorAll('#hourSelector .time-unit').forEach(el => {
        el.classList.remove('selected');
    });
    document.querySelectorAll('#minuteSelector .time-unit').forEach(el => {
        el.classList.remove('selected');
    });
    
    updateSelectedTimeDisplay();
    closeTimePicker();
}

// ============================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    // Добавляем обработчики для полей даты и времени
    const dateInput = document.getElementById('deliveryDate');
    const timeInput = document.getElementById('deliveryTime');
    
    if (dateInput) {
        dateInput.addEventListener('click', openDatePicker);
    }
    
    if (timeInput) {
        timeInput.addEventListener('click', openTimePicker);
    }
});
