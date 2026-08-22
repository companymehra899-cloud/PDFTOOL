/* ============================================================
   JavaScript logic for To-Do List application with local storage
   ============================================================ */

(function () {
    'use strict';

    // DOM Elements
    const todoInput = document.getElementById('todo-input');
    const addBtn = document.getElementById('add-btn');
    const todoList = document.getElementById('todo-list');
    const emptyState = document.getElementById('empty-state');
    const totalCount = document.getElementById('total-count');
    const completedCount = document.getElementById('completed-count');
    const filterBtns = document.querySelectorAll('.filter-btn');
    const clearCompletedBtn = document.getElementById('clear-completed-btn');
    const exportBtn = document.getElementById('export-btn');
    const importBtn = document.getElementById('import-btn');
    const importInput = document.getElementById('import-input');
    const clearAllBtn = document.getElementById('clear-all-btn');
    const toastWrap = document.getElementById('toast-wrap');

    // State
    let todos = [];
    let currentFilter = 'all';
    const STORAGE_KEY = 'quicktools_todos';

    // Initialize
    function init() {
        loadTodos();
        renderTodos();
        setupEventListeners();
    }

    // Local Storage Functions
    function loadTodos() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            todos = stored ? JSON.parse(stored) : [];
        } catch (err) {
            console.error('Error loading todos:', err);
            todos = [];
            toast('Error loading tasks', true);
        }
    }

    function saveTodos() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
        } catch (err) {
            console.error('Error saving todos:', err);
            toast('Error saving tasks', true);
        }
    }

    // Toast Notification
    function toast(msg, isErr = false) {
        const el = document.createElement('div');
        el.className = 'toast' + (isErr ? ' err' : '');
        el.textContent = msg;
        toastWrap.appendChild(el);
        setTimeout(() => el.remove(), 2600);
    }

    // Event Listeners Setup
    function setupEventListeners() {
        addBtn.addEventListener('click', addTodo);
        todoInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') addTodo();
        });
        
        filterBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                filterBtns.forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                currentFilter = e.target.dataset.filter;
                renderTodos();
            });
        });

        clearCompletedBtn.addEventListener('click', clearCompleted);
        exportBtn.addEventListener('click', exportTodos);
        importBtn.addEventListener('click', () => importInput.click());
        importInput.addEventListener('change', importTodos);
        clearAllBtn.addEventListener('click', clearAll);
    }

    // Add Todo
    function addTodo() {
        const text = todoInput.value.trim();
        if (!text) {
            toast('Please enter a task', true);
            return;
        }

        const todo = {
            id: Date.now(),
            text: text,
            completed: false,
            createdAt: new Date().toISOString(),
        };

        todos.push(todo);
        saveTodos();
        todoInput.value = '';
        renderTodos();
        todoInput.focus();
        toast('Task added');
    }

    // Delete Todo
    function deleteTodo(id) {
        todos = todos.filter(todo => todo.id !== id);
        saveTodos();
        renderTodos();
        toast('Task deleted');
    }

    // Toggle Todo
    function toggleTodo(id) {
        const todo = todos.find(t => t.id === id);
        if (todo) {
            todo.completed = !todo.completed;
            saveTodos();
            renderTodos();
        }
    }

    // Edit Todo
    function editTodo(id) {
        const todo = todos.find(t => t.id === id);
        if (!todo) return;

        const todoEl = document.querySelector(`[data-id="${id}"]`);
        const textEl = todoEl.querySelector('.todo-text');

        textEl.contentEditable = 'true';
        textEl.classList.add('editing');
        textEl.focus();

        function saveEdit() {
            const newText = textEl.textContent.trim();
            textEl.contentEditable = 'false';
            textEl.classList.remove('editing');

            if (newText && newText !== todo.text) {
                todo.text = newText;
                saveTodos();
                toast('Task updated');
            }
            renderTodos();
        }

        textEl.addEventListener('blur', saveEdit, { once: true });
        textEl.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveEdit();
            }
        });
    }

    // Clear Completed
    function clearCompleted() {
        const count = todos.filter(t => t.completed).length;
        if (count === 0) {
            toast('No completed tasks', true);
            return;
        }

        if (confirm(`Delete ${count} completed task(s)?`)) {
            todos = todos.filter(t => !t.completed);
            saveTodos();
            renderTodos();
            toast('Completed tasks cleared');
        }
    }

    // Clear All
    function clearAll() {
        if (todos.length === 0) {
            toast('No tasks to clear', true);
            return;
        }

        if (confirm('Delete ALL tasks? This cannot be undone.')) {
            todos = [];
            saveTodos();
            renderTodos();
            toast('All tasks cleared');
        }
    }

    // Export Todos
    function exportTodos() {
        if (todos.length === 0) {
            toast('No tasks to export', true);
            return;
        }

        const data = {
            version: '1.0',
            exportedAt: new Date().toISOString(),
            tasks: todos,
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `todos-${new Date().getTime()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast('Tasks exported');
    }

    // Import Todos
    function importTodos(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (event) {
            try {
                const data = JSON.parse(event.target.result);
                if (!data.tasks || !Array.isArray(data.tasks)) {
                    toast('Invalid file format', true);
                    return;
                }

                const shouldMerge = confirm('Merge with existing tasks? (Cancel = Replace)');
                if (!shouldMerge) {
                    todos = [];
                }

                todos = todos.concat(data.tasks);
                saveTodos();
                renderTodos();
                toast(`${data.tasks.length} task(s) imported`);
            } catch (err) {
                console.error('Import error:', err);
                toast('Error importing file', true);
            }
        };
        reader.readAsText(file);
        importInput.value = '';
    }

    // Update Stats
    function updateStats() {
        const total = todos.length;
        const completed = todos.filter(t => t.completed).length;
        totalCount.textContent = total;
        completedCount.textContent = completed;
    }

    // Get Filtered Todos
    function getFilteredTodos() {
        switch (currentFilter) {
            case 'active':
                return todos.filter(t => !t.completed);
            case 'completed':
                return todos.filter(t => t.completed);
            default:
                return todos;
        }
    }

    // Format Date
    function formatDate(isoString) {
        const date = new Date(isoString);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (date.toDateString() === today.toDateString()) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (date.toDateString() === yesterday.toDateString()) {
            return 'Yesterday';
        } else {
            return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }
    }

    // Render Todos
    function renderTodos() {
        updateStats();
        const filtered = getFilteredTodos();

        todoList.innerHTML = '';

        if (filtered.length === 0) {
            emptyState.hidden = false;
            return;
        }

        emptyState.hidden = true;

        filtered.forEach(todo => {
            const li = document.createElement('li');
            li.className = 'todo-item' + (todo.completed ? ' completed' : '');
            li.dataset.id = todo.id;

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'todo-checkbox';
            checkbox.checked = todo.completed;
            checkbox.addEventListener('change', () => toggleTodo(todo.id));

            const textEl = document.createElement('div');
            textEl.className = 'todo-text';
            textEl.textContent = todo.text;
            textEl.addEventListener('dblclick', () => editTodo(todo.id));

            const metaEl = document.createElement('div');
            metaEl.className = 'todo-meta';
            
            const dateEl = document.createElement('span');
            dateEl.className = 'todo-date';
            dateEl.textContent = formatDate(todo.createdAt);
            metaEl.appendChild(dateEl);

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'todo-delete';
            deleteBtn.textContent = 'Delete';
            deleteBtn.addEventListener('click', () => deleteTodo(todo.id));

            li.appendChild(checkbox);
            li.appendChild(textEl);
            li.appendChild(metaEl);
            li.appendChild(deleteBtn);
            todoList.appendChild(li);
        });
    }

    // Start Application
    init();
})();
