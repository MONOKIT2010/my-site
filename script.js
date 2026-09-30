// Змінні обраних опцій
let selectedPlace = "";
let selectedFood = "";
let selectedDay = "";

// Отримання елементів
const questionScreen = document.getElementById("questionScreen");
const placeScreen = document.getElementById("placeScreen");
const foodScreen = document.getElementById("foodScreen");
const dateScreen = document.getElementById("dateScreen");
const finalScreen = document.getElementById("finalScreen");

const btnYes = document.getElementById("yes");
const btnNo = document.getElementById("no");

const placeButtons = document.querySelectorAll(".place");
const customPlaceInput = document.getElementById("customPlace");
const continueToFoodBtn = document.getElementById("continueToFood");

const foodButtons = document.querySelectorAll(".food");
const customFoodInput = document.getElementById("customFood");
const backToPlaceBtn = document.getElementById("backToPlace");
const continueToDayBtn = document.getElementById("continueToDay");

const dayButtons = document.querySelectorAll(".day");
const backToFoodBtn = document.getElementById("backToFood");
const confirmBtn = document.getElementById("confirm");
const resultText = document.getElementById("resultText");
const sharePlanBtn = document.getElementById("sharePlan");
const shareStatus = document.getElementById("shareStatus");

// --- 1. Анімації поцілунків при дотику / наведенні на "Не сьогодні" ---
const kissEmojis = ["😘", "💋", "😚", "👩‍❤️‍💋‍👨", "✨", "💖", "👄"];

function spawnKiss(x, y) {
    const kiss = document.createElement("div");
    kiss.className = "kiss-emoji";
    kiss.innerText = kissEmojis[Math.floor(Math.random() * kissEmojis.length)];
    
    const dx = (Math.random() - 0.5) * 120 + "px";
    const rot = (Math.random() - 0.5) * 40 + "deg";
    
    kiss.style.left = `${x}px`;
    kiss.style.top = `${y}px`;
    kiss.style.setProperty("--dx", dx);
    kiss.style.setProperty("--rot", rot);

    document.body.appendChild(kiss);

    setTimeout(() => {
        kiss.remove();
    }, 1200);
}

function handleNoInteraction(e) {
    e.preventDefault();
    let rect = btnNo.getBoundingClientRect();
    let x = rect.left + rect.width / 2;
    let y = rect.top + rect.height / 2;

    if (e.touches && e.touches[0]) {
        x = e.touches[0].clientX;
        y = e.touches[0].clientY;
    } else if (e.clientX && e.clientY) {
        x = e.clientX;
        y = e.clientY;
    }

    for (let i = 0; i < 3; i++) {
        setTimeout(() => {
            spawnKiss(x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 20);
        }, i * 100);
    }

    const randomX = (Math.random() - 0.5) * 80;
    const randomY = (Math.random() - 0.5) * 40;
    btnNo.style.transform = `translate(${randomX}px, ${randomY}px)`;
}

btnNo.addEventListener("click", handleNoInteraction);
btnNo.addEventListener("touchstart", handleNoInteraction, { passive: false });
btnNo.addEventListener("mouseenter", handleNoInteraction);

// --- 2. Переходи між екранами ---
btnYes.addEventListener("click", () => {
    questionScreen.classList.add("hidden");
    placeScreen.classList.remove("hidden");
});

// Місце
placeButtons.forEach(btn => {
    btn.addEventListener("click", () => {
        placeButtons.forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
        customPlaceInput.value = "";
        selectedPlace = btn.getAttribute("data-place");
        continueToFoodBtn.style.display = "block";
    });
});

customPlaceInput.addEventListener("input", () => {
    if (customPlaceInput.value.trim().length > 0) {
        placeButtons.forEach(b => b.classList.remove("selected"));
        selectedPlace = customPlaceInput.value.trim();
        continueToFoodBtn.style.display = "block";
    } else {
        continueToFoodBtn.style.display = "none";
        selectedPlace = "";
    }
});

continueToFoodBtn.addEventListener("click", () => {
    if (!selectedPlace) return;
    placeScreen.classList.add("hidden");
    foodScreen.classList.remove("hidden");
});

// Їжа
foodButtons.forEach(btn => {
    btn.addEventListener("click", () => {
        foodButtons.forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
        customFoodInput.value = "";
        selectedFood = btn.getAttribute("data-food");
        continueToDayBtn.style.display = "block";
    });
});

customFoodInput.addEventListener("input", () => {
    if (customFoodInput.value.trim().length > 0) {
        foodButtons.forEach(b => b.classList.remove("selected"));
        selectedFood = customFoodInput.value.trim();
        continueToDayBtn.style.display = "block";
    } else {
        continueToDayBtn.style.display = "none";
        selectedFood = "";
    }
});

backToPlaceBtn.addEventListener("click", () => {
    foodScreen.classList.add("hidden");
    placeScreen.classList.remove("hidden");
});

continueToDayBtn.addEventListener("click", () => {
    if (!selectedFood) return;
    foodScreen.classList.add("hidden");
    dateScreen.classList.remove("hidden");
});

// День
dayButtons.forEach(btn => {
    btn.addEventListener("click", () => {
        dayButtons.forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
        selectedDay = btn.getAttribute("data-day");
        confirmBtn.style.display = "block";
    });
});

backToFoodBtn.addEventListener("click", () => {
    dateScreen.classList.add("hidden");
    foodScreen.classList.remove("hidden");
});

// --- 3. Відправка сповіщення через Telegram або email ---
async function sendResultToChannel(place, food, day) {
    try {
        const response = await fetch("/api/send-result", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ place, food, day })
        });
        const data = await response.json();
        return {
            ok: response.ok && data.success === true,
            channels: Array.isArray(data.channels) ? data.channels : []
        };
    } catch (e) {
        console.error("Помилка відправки сповіщення:", e);
        return { ok: false, channels: [] };
    }
}

confirmBtn.addEventListener("click", async () => {
    if (!selectedPlace || !selectedFood || !selectedDay) return;

    confirmBtn.disabled = true;
    confirmBtn.innerText = "Надсилаємо... ⏳";

    const result = await sendResultToChannel(selectedPlace, selectedFood, selectedDay);

    dateScreen.classList.add("hidden");
    finalScreen.classList.remove("hidden");

    resultText.innerText = `📍 Місце: ${selectedPlace}\n🍔 Їжа: ${selectedFood}\n📅 День: ${selectedDay}`;
    const channelName = result.channels.includes("telegram")
        ? "Telegram"
        : result.channels.includes("email")
            ? "email"
            : "канал сповіщень";
    document.querySelector(".final-sub").innerText = result.ok
        ? `План надіслано в ${channelName}! Чекаю з нетерпінням ✨`
        : "План підтверджено, але повідомлення не надіслано. Перевір налаштування Telegram або email на сервері.";

    // Святкова салют-анімація
    for (let i = 0; i < 25; i++) {
        setTimeout(() => {
            const rx = Math.random() * window.innerWidth;
            const ry = Math.random() * window.innerHeight * 0.7 + window.innerHeight * 0.2;
            spawnKiss(rx, ry);
        }, i * 120);
    }
});

sharePlanBtn.addEventListener("click", async () => {
    const text = resultText.innerText;

    if (navigator.share) {
        try {
            await navigator.share({ title: "Наш маленький план", text });
            return;
        } catch (error) {
            if (error.name === "AbortError") return;
        }
    }

    try {
        if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
        await navigator.clipboard.writeText(text);
        shareStatus.innerText = "План скопійовано. Встав його у свій чат.";
    } catch {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.setAttribute("readonly", "");
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.select();
        const copied = document.execCommand("copy");
        textArea.remove();
        shareStatus.innerText = copied
            ? "План скопійовано. Встав його у свій чат."
            : "Не вдалося скопіювати. Виділи текст плану вище.";
    }
});
