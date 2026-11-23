"use strict";

(() => {
  const STORAGE_KEY = "rashody.expenses.v1";
  const BUDGET_STORAGE_KEY = "rashody.budgets.v1";
  const CATEGORIES = ["Еда", "Транспорт", "Дом", "Другое", "Долги"];
  const form = document.getElementById("expense-form");
  const amountInput = document.getElementById("amount");
  const categoryInput = document.getElementById("category");
  const dateInput = document.getElementById("date");
  const commentInput = document.getElementById("comment");
  const list = document.getElementById("expense-list");
  const status = document.getElementById("form-status");
  const storageError = document.getElementById("storage-error");
  const budgetStatus = document.getElementById("budget-status");
  const budgetStorageError = document.getElementById("budget-storage-error");
  const budgetFields = [];
  let expenses = [];
  let storageReadable = true;
  let budgets = {};
  let budgetsReadable = true;
  let budgetMonth = "";

  function localDate(date) {
    return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function isValidDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    if (year < 1 || month < 1 || month > 12 || day < 1) return false;
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return day <= days[month - 1];
  }

  function formatMoney(amount) {
    return `${String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ₸`;
  }

  function parseAmount(value) {
    const text = value.trim();
    if (!/^(?:\d+|\d{1,3}(?:[ \u00a0\u202f]\d{3})+)$/.test(text)) return null;
    const amount = Number(text.replace(/[ \u00a0\u202f]/g, ""));
    return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
  }

  function setFieldError(input, message) {
    const error = document.getElementById(`${input.id}-error`);
    error.textContent = message;
    error.hidden = !message;
    if (message) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
  }

  function showStorageError(message) {
    storageError.textContent = message;
    storageError.hidden = false;
  }

  function isExpense(value) {
    return value !== null && typeof value === "object"
      && Number.isSafeInteger(value.amount) && value.amount > 0
      && CATEGORIES.includes(value.category) && isValidDate(value.date)
      && typeof value.comment === "string";
  }

  function loadExpenses() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === null) return;
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed) || !parsed.every(isExpense)) throw new Error("Invalid expenses");
      expenses = parsed;
    } catch {
      storageReadable = false;
      showStorageError("Не удалось прочитать сохранённые траты. Проверьте доступ к данным браузера и обновите страницу. Добавление временно недоступно.");
    }
  }

  function showBudgetStorageError(message) {
    budgetStorageError.textContent = message;
    budgetStorageError.hidden = false;
  }

  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function loadBudgets() {
    try {
      const saved = localStorage.getItem(BUDGET_STORAGE_KEY);
      if (saved === null) return;
      const parsed = JSON.parse(saved);
      if (!isRecord(parsed) || !Object.entries(parsed).every(([month, limits]) => (
        isValidDate(`${month}-01`) && isRecord(limits)
        && Object.entries(limits).every(([category, amount]) => (
          CATEGORIES.includes(category) && Number.isSafeInteger(amount) && amount > 0
        ))
      ))) throw new Error("Invalid budgets");
      budgets = parsed;
    } catch {
      budgetsReadable = false;
      showBudgetStorageError("Не удалось прочитать сохранённые лимиты. Проверьте доступ к данным браузера и обновите страницу. Изменение лимитов временно недоступно.");
    }
  }

  function renderBudgets(today) {
    const month = localDate(today).slice(0, 7);
    const monthChanged = budgetMonth !== month;
    budgetMonth = month;
    document.getElementById("budget-month").textContent = today.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
    if (monthChanged) budgetStatus.textContent = "";

    for (const field of budgetFields) {
      const amount = budgets[month]?.[field.category] ?? null;
      field.limit.textContent = !budgetsReadable ? "Лимиты недоступны"
        : amount === null ? "Лимит не задан" : `Лимит: ${formatMoney(amount)}`;
      field.remove.hidden = amount === null;
      field.input.disabled = field.save.disabled = field.remove.disabled = !budgetsReadable;
      if (monthChanged || field.savedAmount !== amount) {
        field.input.value = amount === null ? "" : String(amount);
        setFieldError(field.input, "");
        field.savedAmount = amount;
      }
    }
  }

  function changeBudget(field, remove = false) {
    budgetStatus.textContent = "";
    if (!budgetsReadable) return;
    const today = new Date();
    const month = localDate(today).slice(0, 7);
    // Не применяем оставленный открытым ввод к другому месяцу.
    if (month !== budgetMonth) {
      renderBudgets(today);
      budgetStatus.textContent = "Начался новый месяц. Укажите лимит заново.";
      return;
    }
    const amount = remove ? null : parseAmount(field.input.value);
    setFieldError(field.input, !remove && amount === null
      ? `Введите целый лимит от 1 до ${formatMoney(Number.MAX_SAFE_INTEGER)}. Например, 15 000.` : "");
    if (!remove && amount === null) {
      field.input.focus();
      return;
    }

    const limits = { ...budgets[month] };
    if (remove) delete limits[field.category];
    else limits[field.category] = amount;
    const nextBudgets = { ...budgets, [month]: limits };
    if (Object.keys(limits).length === 0) delete nextBudgets[month];
    try {
      localStorage.setItem(BUDGET_STORAGE_KEY, JSON.stringify(nextBudgets));
    } catch {
      showBudgetStorageError("Не удалось сохранить изменение лимита. Проверьте свободное место и разрешение на хранение данных в браузере, затем попробуйте снова.");
      return;
    }
    budgets = nextBudgets;
    budgetStorageError.hidden = true;
    renderBudgets(today);
    field.input.value = remove ? "" : String(amount);
    if (remove) field.input.focus();
    budgetStatus.textContent = `${field.category}: лимит ${remove ? "убран" : "сохранён"}`;
  }

  function createBudgetForms() {
    const template = document.getElementById("budget-category-template");
    const fragment = document.createDocumentFragment();
    CATEGORIES.forEach((category, index) => {
      const item = template.content.firstElementChild.cloneNode(true);
      const input = item.querySelector("input");
      const heading = item.querySelector("h3");
      const limit = item.querySelector(".budget-limit");
      input.id = `budget-amount-${index}`;
      heading.id = `budget-category-${index}`;
      heading.textContent = category;
      limit.id = `budget-limit-${index}`;
      item.setAttribute("aria-labelledby", heading.id);
      item.querySelector("label").htmlFor = input.id;
      item.querySelector(".field-error").id = `${input.id}-error`;
      input.setAttribute("aria-describedby", `${limit.id} ${input.id}-error`);
      const field = { category, input, limit,
        save: item.querySelector(".budget-save"), remove: item.querySelector(".budget-remove") };
      item.addEventListener("submit", (event) => {
        event.preventDefault();
        changeBudget(field);
      });
      field.remove.addEventListener("click", () => changeBudget(field, true));
      input.addEventListener("input", () => {
        setFieldError(input, "");
        budgetStatus.textContent = "";
      });
      budgetFields.push(field);
      fragment.append(item);
    });
    document.getElementById("budget-list").append(fragment);
  }

  function render() {
    const today = new Date();
    const currentMonth = localDate(today).slice(0, 7);
    const total = expenses.reduce((sum, expense) => (
      expense.date.slice(0, 7) === currentMonth ? sum + BigInt(expense.amount) : sum
    ), 0n);

    document.getElementById("month-total").textContent = formatMoney(total);
    document.getElementById("current-month").textContent = today.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
    document.getElementById("expense-count").textContent = `Записей: ${expenses.length}`;
    document.getElementById("empty-state").hidden = expenses.length > 0;
    renderBudgets(today);

    const sorted = expenses.map((expense, index) => ({ expense, index }))
      .sort((a, b) => b.expense.date.localeCompare(a.expense.date) || b.index - a.index);
    const fragment = document.createDocumentFragment();

    for (const { expense } of sorted) {
      const item = document.createElement("li");
      item.className = "expense";
      const top = document.createElement("div");
      top.className = "expense-top";
      const details = document.createElement("div");
      const category = document.createElement("p");
      category.className = "expense-category";
      category.textContent = expense.category;
      const date = document.createElement("time");
      date.className = "expense-date";
      date.dateTime = expense.date;
      date.textContent = expense.date.split("-").reverse().join(".");
      details.append(category, date);
      const amount = document.createElement("p");
      amount.className = "expense-amount";
      amount.textContent = formatMoney(expense.amount);
      top.append(details, amount);
      item.append(top);
      if (expense.comment) {
        const comment = document.createElement("p");
        comment.className = "expense-comment";
        comment.textContent = expense.comment;
        item.append(comment);
      }
      fragment.append(item);
    }
    list.replaceChildren(fragment);
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    status.textContent = "";
    const amount = parseAmount(amountInput.value);
    setFieldError(amountInput, amount === null
      ? `Введите целую сумму от 1 до ${formatMoney(Number.MAX_SAFE_INTEGER)}. Например, 5 000.` : "");
    setFieldError(categoryInput, CATEGORIES.includes(categoryInput.value) ? "" : "Выберите категорию.");
    setFieldError(dateInput, isValidDate(dateInput.value) ? "" : "Укажите корректную дату.");
    const invalidField = form.querySelector('[aria-invalid="true"]');
    if (invalidField) {
      invalidField.focus();
      return;
    }
    if (!storageReadable) {
      showStorageError("Сначала восстановите доступ к сохранённым тратам и обновите страницу.");
      return;
    }

    const nextExpenses = [...expenses, {
      amount,
      category: categoryInput.value,
      date: dateInput.value,
      comment: commentInput.value.trim(),
    }];
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextExpenses));
    } catch {
      showStorageError("Не удалось сохранить трату. Проверьте свободное место и разрешение на хранение данных в браузере, затем попробуйте снова.");
      return;
    }

    expenses = nextExpenses;
    storageError.hidden = true;
    render();
    amountInput.value = "";
    commentInput.value = "";
    status.textContent = "Трата добавлена";
    amountInput.focus();
  });

  for (const input of [amountInput, categoryInput, dateInput]) {
    input.addEventListener("input", () => {
      setFieldError(input, "");
      status.textContent = "";
    });
  }
  commentInput.addEventListener("input", () => { status.textContent = ""; });

  document.querySelectorAll(".shortcut").forEach((button) => {
    button.addEventListener("click", () => {
      const date = new Date();
      // Полдень сохраняет календарный день при переходе на летнее время.
      date.setHours(12, 0, 0, 0);
      if (button.hasAttribute("data-month-ago")) {
        const day = date.getDate();
        date.setDate(1);
        date.setMonth(date.getMonth() - 1);
        const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
        date.setDate(Math.min(day, lastDay));
      } else {
        date.setDate(date.getDate() - Number(button.dataset.daysAgo));
      }
      dateInput.value = localDate(date);
      setFieldError(dateInput, "");
      status.textContent = "";
    });
  });

  dateInput.value = localDate(new Date());
  loadExpenses();
  loadBudgets();
  createBudgetForms();
  render();
  window.addEventListener("pageshow", render);
  window.addEventListener("focus", render);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) render(); });
})();
