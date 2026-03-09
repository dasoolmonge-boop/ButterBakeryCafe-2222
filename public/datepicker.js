// datepicker.js - Логика для выбора даты и времени

let currentDate = new Date();
let selectedDate = null;
let selectedTime = null;
let currentMonth = currentDate.getMonth();
let currentYear = currentDate.getFullYear();

// Дни недели
const weekdays = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];

// Месяца
const months = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

// Доступное время (можно настроить под свой график)
const availableTimeSlots = [
    '09:00', '10:00', '11:00', '12:00', '13:00', '14:00',
    '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'
];

// Открыть календарь
function openDatePicker() {
    renderCalendar();
    document.getElementById('datePickerModal').classList.add('open');
}

// Закрыть календарь
function closeDatePicker() {
    document.getElementById('datePickerModal').classList.remove('open');
}

// Открыть выбор времени
function openTimePicker() {
    renderTimeSlots();
    document.getElementById('timePickerModal').classList.add('open');
}

// Закрыть выбор времени
function closeTimePicker() {
    document.getElementById('timePickerModal').classList.remove('open');
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

// Рендер слотов времени
function renderTimeSlots() {
    const timeSlots = document.getElementById('timeSlots');
    
    let html = '';
    availableTimeSlots.forEach(time => {
        const isSelected = selectedTime === time;
        const selectedClass = isSelected ? 'selected' : '';
        
        html += `<div class="time-slot ${selectedClass}" onclick="selectTime('${time}')">${time}</div>`;
    });
    
    timeSlots.innerHTML = html;
}

// Выбрать время
function selectTime(time) {
    // Убираем выделение со всех слотов
    document.querySelectorAll('.time-slot').forEach(el => {
        el.classList.remove('selected');
    });
    
    // Выделяем выбранный слот
    event.target.classList.add('selected');
    
    // Сохраняем выбранное время
    selectedTime = time;
}

// Подтвердить выбор времени
function confirmTime() {
    if (selectedTime) {
        document.getElementById('deliveryTime').value = selectedTime;
        closeTimePicker();
    } else {
        showToast('Выберите время', 'warning');
    }
}

// Сбросить время
function resetTime() {
    selectedTime = null;
    document.getElementById('deliveryTime').value = '';
    
    // Убираем выделение со всех слотов
    document.querySelectorAll('.time-slot').forEach(el => {
        el.classList.remove('selected');
    });
    
    closeTimePicker();
}

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    // Делаем поля даты и времени кликабельными
    const dateInput = document.getElementById('deliveryDate');
    const timeInput = document.getElementById('deliveryTime');
    
    if (dateInput) {
        dateInput.readOnly = true;
        dateInput.classList.add('input-with-icon');
        dateInput.addEventListener('click', openDatePicker);
        
        // Добавляем иконку календаря
        const wrapper = document.createElement('div');
        wrapper.className = 'input-with-icon';
        dateInput.parentNode.insertBefore(wrapper, dateInput);
        wrapper.appendChild(dateInput);
        wrapper.innerHTML += '<i class="fas fa-calendar"></i>';
    }
    
    if (timeInput) {
        timeInput.readOnly = true;
        timeInput.classList.add('input-with-icon');
        timeInput.addEventListener('click', openTimePicker);
        
        // Добавляем иконку часов
        const wrapper = document.createElement('div');
        wrapper.className = 'input-with-icon';
        timeInput.parentNode.insertBefore(wrapper, timeInput);
        wrapper.appendChild(timeInput);
        wrapper.innerHTML += '<i class="fas fa-clock"></i>';
    }
});
