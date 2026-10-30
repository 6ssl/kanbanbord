const STORAGE_KEY = "plak-kanban-v1";
const BACKEND_KEY = "plak-supabase-config-v1";
const PROFILE_KEY = "plak-profile-v1";
const THEME_KEY = "plak-theme-v1";
const DEFAULT_SUPABASE_CONFIG = {
  url: "https://eacnppeupstfssnjwqbh.supabase.co",
  key: "sb_publishable_LI-Qu9kPvqI1dT7bUFehcw_ZhLBPQ6I"
};
const initialState = {
  boardTitle: "Project Spruit",
  columns: [
    { id: "ideas", name: "Ideeën", color: "#dfa768" },
    { id: "todo", name: "Op de planning", color: "#8299b2" },
    { id: "doing", name: "In uitvoering", color: "#9b87b5" },
    { id: "done", name: "Helemaal klaar!", color: "#76a27c" }
  ],
  tasks: [
    { id: "task-1", column: "ideas", title: "Een naam bedenken voor ons project", description: "Iets vrolijks dat blijft hangen ✨", tag: "Brainstorm", tone: "lilac", due: "24 jun", completed: false },
    { id: "task-2", column: "ideas", title: "Inspiratie verzamelen", description: "Wat maakt andere projecten zo fijn?", tag: "Idee", tone: "blue", due: "", completed: false },
    { id: "task-3", column: "todo", title: "De eerste schets maken", description: "Gewoon beginnen, het hoeft niet perfect.", tag: "Ontwerp", tone: "peach", due: "25 jun", completed: false },
    { id: "task-4", column: "todo", title: "Check-in met het team plannen", description: "", tag: "Team", tone: "blue", due: "26 jun", completed: false },
    { id: "task-5", column: "doing", title: "Kleuren en sfeer uitzoeken", description: "Groen, warm en een beetje eigenwijs 🌿", tag: "Ontwerp", tone: "peach", due: "Vandaag", completed: false },
    { id: "task-6", column: "done", title: "Een plek maken voor al onze ideeën", description: "", tag: "Start", tone: "mint", due: "Gisteren", completed: true }
  ],
  notes: [
    { id: "note-1", text: "Misschien kunnen we beginnen met een kleine workshop? 🌱" },
    { id: "note-2", text: "Niet vergeten: plezier is ook een planning!" },
    { id: "note-3", text: "Vraag Noor naar dat leuke kleurpalet 🎨" }
  ]
};
let state = loadState();
let toastTimer;
let draggedTaskId = null;
let supabaseClient = null;
let roomChannel = null;
let activeRoomId = null;
let roomSaveTimer = null;
let cursorTimer = null;
let lastCursorSent = 0;
let cursorPublishErrorShown = false;
const profile = loadProfile();
const clientId = crypto.randomUUID();

function loadProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem(PROFILE_KEY) || "null");
    return saved && saved.id && saved.name && saved.color ? saved : {
      id: crypto.randomUUID(),
      name: "Gast",
      color: ["#dc795e", "#608eb0", "#946eae", "#59956e", "#cd9c43", "#c56c91"][Math.floor(Math.random() * 6)]
    };
  } catch (error) {
    console.error("Profiel kon niet worden geladen:", error);
    return { id: crypto.randomUUID(), name: "Gast", color: "#608eb0" };
  }
}
function loadTheme() {
  try { return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light"; }
  catch (error) {
    console.error("Thema-instelling kon niet worden geladen:", error);
    return "light";
  }
}
function applyTheme(theme) {
  const isDark = theme === "dark";
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
  const button = document.querySelector("#themeToggle");
  button.textContent = isDark ? "☀" : "☾";
  button.setAttribute("aria-pressed", String(isDark));
  button.setAttribute("aria-label", isDark ? "Schakel naar lichte modus" : "Schakel naar donkere modus");
  button.title = isDark ? "Schakel naar lichte modus" : "Schakel naar donkere modus";
  document.querySelector('meta[name="theme-color"]').content = isDark ? "#20241f" : "#f7f5f0";
}
function renderBoardTitle() {
  const title = state.boardTitle || initialState.boardTitle;
  document.querySelector(".title-row h1").textContent = title;
  document.querySelectorAll("[data-board-title]").forEach(element => { element.textContent = title; });
  document.querySelector(".central-node strong").textContent = title;
  document.title = `${title} — Plak`;
}
function saveProfile() {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); }
  catch (error) { console.error("Profiel kon niet worden opgeslagen:", error); }
}
function safeColor(value) {
  return /^#[0-9a-f]{6}$/i.test(value || "") ? value : "#608eb0";
}
async function connectSupabase() {
  let config;
  try { config = JSON.parse(localStorage.getItem(BACKEND_KEY) || "null") || DEFAULT_SUPABASE_CONFIG; }
  catch (error) { console.error("Supabase-instellingen konden niet worden gelezen:", error); return false; }
  if (!config?.url || !config?.key) return false;
  if (!window.supabase?.createClient) {
    showToast("Supabase kon niet laden. Controleer je internetverbinding en ververs de pagina.");
    return false;
  }
  try {
    supabaseClient = window.supabase.createClient(config.url, config.key);
    const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError) throw sessionError;
    if (!sessionData.session) {
      const { error } = await supabaseClient.auth.signInAnonymously();
      if (error) throw error;
    }
    updateConnectionStatus("connected");
    return true;
  } catch (error) {
    console.error("Verbinding met Supabase instellen mislukte:", error);
    updateConnectionStatus("offline");
    const message = error?.message?.includes("Anonymous sign-ins are disabled")
      ? "Schakel Anonymous Sign-Ins in via Supabase → Authentication → Sign In / Providers."
      : "Supabase verbinden lukte niet. Controleer de projectinstellingen.";
    showToast(message);
    return false;
  }
}
function updateConnectionStatus(status) {
  const indicator = document.querySelector(".saved-indicator");
  indicator.classList.toggle("connection-error", status === "offline");
  const labels = {
    local: "Automatisch opgeslagen",
    connected: "Supabase verbonden · niet in een room",
    connecting: "Realtime-room verbinden…",
    ready: "Multiplayer actief",
    offline: "Realtime niet verbonden"
  };
  indicator.innerHTML = `<i></i> ${labels[status] || labels.local}`;
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return structuredClone(initialState);
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed.columns) || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.notes)) throw new Error("Ongeldige bordgegevens.");
    return { ...parsed, boardTitle: typeof parsed.boardTitle === "string" && parsed.boardTitle.trim() ? parsed.boardTitle : initialState.boardTitle };
  } catch (error) {
    console.error("Bordgegevens konden niet worden geladen:", error);
    return structuredClone(initialState);
  }
}
function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (error) { console.error("Bordgegevens konden niet worden opgeslagen:", error); showToast("Opslaan lukte niet. Controleer de opslagruimte van je browser."); }
  if (activeRoomId && supabaseClient) {
    clearTimeout(roomSaveTimer);
    roomSaveTimer = setTimeout(() => syncRoomState(), 200);
  }
}
async function syncRoomState() {
  if (!activeRoomId || !supabaseClient) return;
  const { error } = await supabaseClient.from("rooms").update({
    board_state: state,
    updated_at: new Date().toISOString(),
    updated_by: clientId
  }).eq("room_id", activeRoomId);
  if (error) {
    console.error("Bord synchroniseren met de room mislukte:", error);
    updateConnectionStatus("offline");
    showToast("Synchroniseren lukte niet. Controleer de Supabase-configuratie en tabelrechten.");
  }
}
function acceptRemoteState(remoteState) {
  if (!remoteState || !Array.isArray(remoteState.columns) || !Array.isArray(remoteState.tasks) || !Array.isArray(remoteState.notes)) {
    console.error("De gedeelde room bevat ongeldige bordgegevens.");
    showToast("De gegevens in deze room zijn ongeldig.");
    return;
  }
  state = remoteState;
  if (typeof state.boardTitle !== "string" || !state.boardTitle.trim()) state.boardTitle = initialState.boardTitle;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (error) { console.error("Gedeeld bord lokaal bewaren mislukte:", error); }
  renderBoardTitle();
  renderBoard();
  renderNotes();
}
async function leaveRoom() {
  clearTimeout(roomSaveTimer);
  if (roomChannel) {
    const previousChannel = roomChannel;
    roomChannel = null;
    const { error } = await supabaseClient.removeChannel(previousChannel);
    if (error) console.error("Room verlaten mislukte:", error);
  }
  activeRoomId = null;
  document.querySelector("#roomButtonText").textContent = "Deel bord";
  document.querySelector("#memberAvatars").innerHTML = '<span class="avatar avatar-you" title="Jij">J</span><button id="inviteAvatar" class="avatar avatar-add" title="Nodig iemand uit">+</button>';
  document.querySelector("#inviteAvatar").addEventListener("click", openRoomDialog);
  document.querySelector("#remoteCursors").replaceChildren();
  updateConnectionStatus(supabaseClient ? "connected" : "local");
}
async function joinRoom(roomId, initialState) {
  if (!supabaseClient && !await connectSupabase()) {
    showToast("Stel eerst Supabase in om multiplayer te gebruiken.");
    return false;
  }
  await leaveRoom();
  if (initialState) {
    const { data, error } = await supabaseClient.rpc("create_room", { p_board_state: initialState });
    if (error) {
      console.error("Room aanmaken mislukte:", error);
      showToast("Room aanmaken mislukte. Controleer of het SQL-script is uitgevoerd en anonieme aanmelding aanstaat.");
      return false;
    }
    roomId = data;
    state = initialState;
    saveState();
  } else {
    const { error: joinError } = await supabaseClient.rpc("join_room", { p_room_id: roomId });
    if (joinError) {
      console.error("Room joinen mislukte:", joinError);
      showToast("Room niet gevonden of de Supabase-toegangsregels zijn nog niet ingesteld.");
      return false;
    }
    const { data, error } = await supabaseClient.from("rooms").select("board_state").eq("room_id", roomId).maybeSingle();
    if (error) {
      console.error("Room laden mislukte:", error);
      showToast("Room laden mislukte. Controleer de Supabase-configuratie.");
      return false;
    }
    if (!data) { showToast("Deze roomcode is niet gevonden. Vraag de maker om een geldige code."); return false; }
    acceptRemoteState(data.board_state);
  }
  activeRoomId = roomId;
  document.querySelector("#roomButtonText").textContent = roomId;
  updateConnectionStatus("connecting");
  roomChannel = supabaseClient.channel(`room:${roomId}`, { config: { presence: { key: clientId } } });
  const channel = roomChannel;
  const realtimeReady = new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      fail("TIMED_OUT");
    }, 12000);
    const fail = status => {
      updateConnectionStatus("offline");
      showToast(status === "PRESENCE_ERROR"
        ? "Deelnemers en cursors publiceren lukte niet. Controleer de Supabase Realtime-toegangsregels."
        : `Realtime verbinden lukte niet (${status}). Controleer of Realtime aanstaat en probeer opnieuw.`);
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(new Error(`Room realtime connection failed: ${status}`));
      }
    };

    channel
    .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `room_id=eq.${roomId}` }, payload => {
      if (payload.new?.board_state && payload.new.updated_by !== clientId) acceptRemoteState(payload.new.board_state);
    })
    .on("presence", { event: "sync" }, renderRoomMembers)
    .on("presence", { event: "join" }, renderRoomMembers)
    .on("presence", { event: "leave" }, renderRoomMembers)
    .on("broadcast", { event: "cursor" }, ({ payload }) => renderRemoteCursor(payload))
    .subscribe(async status => {
      if (status === "SUBSCRIBED") {
        try {
          const { error } = await channel.track({ id: clientId, name: profile.name, color: safeColor(profile.color), x: null, y: null });
          if (error) {
            console.error("Room-aanwezigheid publiceren mislukte:", error);
            fail("PRESENCE_ERROR");
            return;
          }
          updateConnectionStatus("ready");
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            resolve();
          }
        } catch (error) {
          console.error("Room-aanwezigheid publiceren mislukte:", error);
          fail("PRESENCE_ERROR");
        }
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        console.error("Room realtime verbinding status:", status);
        fail(status);
      }
    });
  });
  try {
    await realtimeReady;
  } catch (error) {
    console.error("Room realtime verbinden mislukte:", error);
    await leaveRoom();
    updateConnectionStatus("offline");
    return false;
  }
  showToast(`Je doet mee in room ${roomId}! 🎉`);
  return true;
}
function renderRoomMembers() {
  if (!roomChannel) return;
  const members = Object.values(roomChannel.presenceState()).flat().filter(member => member.id !== clientId);
  const stack = document.querySelector("#memberAvatars");
  stack.innerHTML = `<span class="avatar avatar-you" style="background:${safeColor(profile.color)};color:white" title="${escapeHtml(profile.name)}">${escapeHtml(profile.name.slice(0, 1).toUpperCase())}</span>${members.slice(0, 5).map(member => `<span class="avatar" style="background:${safeColor(member.color)};color:white" title="${escapeHtml(member.name)}">${escapeHtml(String(member.name || "?").slice(0, 1).toUpperCase())}</span>`).join("")}<button id="inviteAvatar" class="avatar avatar-add" title="Nodig iemand uit">+</button>`;
  document.querySelector("#inviteAvatar").addEventListener("click", openRoomDialog);
  const cursors = document.querySelector("#remoteCursors");
  const memberIds = new Set(members.map(member => String(member.id)));
  cursors.querySelectorAll(".remote-cursor").forEach(cursor => {
    if (!memberIds.has(cursor.dataset.memberId)) cursor.remove();
  });
}
function renderRemoteCursor(member) {
  const memberId = String(member?.id || "");
  if (!memberId || memberId === clientId || !Number.isFinite(member.x) || !Number.isFinite(member.y)) return;
  const cursors = document.querySelector("#remoteCursors");
  let cursor = Array.from(cursors.querySelectorAll(".remote-cursor")).find(item => item.dataset.memberId === memberId);
  if (!cursor) {
    cursor = document.createElement("div");
    cursor.className = "remote-cursor";
    cursor.dataset.memberId = memberId;
    cursor.innerHTML = '<svg viewBox="0 0 18 22" aria-hidden="true"><path d="M2 2v16l4.5-4.5L10 21l3-1.5-3.8-7H16L2 2Z" fill="currentColor" stroke="white" stroke-width="1.4" stroke-linejoin="round"/></svg><span></span>';
    cursors.append(cursor);
  }
  cursor.style.left = `${Math.max(0, Math.min(1, member.x)) * window.innerWidth}px`;
  cursor.style.top = `${Math.max(0, Math.min(1, member.y)) * window.innerHeight}px`;
  cursor.style.setProperty("--cursor-color", safeColor(member.color));
  cursor.querySelector("span").textContent = String(member.name || "Gast");
}
function publishCursor(event) {
  if (!roomChannel || !activeRoomId) return;
  const now = Date.now();
  if (now - lastCursorSent < 60) return;
  lastCursorSent = now;
  clearTimeout(cursorTimer);
  cursorTimer = setTimeout(() => {
    if (!roomChannel || !activeRoomId) return;
    const payload = {
      id: clientId,
      name: profile.name,
      color: safeColor(profile.color),
      x: event.clientX / window.innerWidth,
      y: event.clientY / window.innerHeight
    };
    roomChannel.send({ type: "broadcast", event: "cursor", payload }).then(status => {
      if (status !== "ok") throw new Error(`Cursor broadcast failed: ${status}`);
    }).catch(error => {
      console.error("Cursorpositie publiceren mislukte:", error);
      if (!cursorPublishErrorShown) {
        cursorPublishErrorShown = true;
        showToast("Je cursor kon niet met de room worden gedeeld. Controleer de Supabase Realtime-instellingen.");
      }
    });
  }, 60);
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3000);
}
function renderBoard() {
  const query = document.querySelector("#searchInput").value.trim().toLowerCase();
  const filter = document.querySelector("#filterSelect").value;
  const columns = document.querySelector("#columns");
  columns.innerHTML = state.columns.map(column => {
    const tasks = state.tasks.filter(task => {
      const subtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
      const matchesQuery = !query || `${task.title} ${task.description} ${task.tag} ${subtasks.map(subtask => subtask.title).join(" ")}`.toLowerCase().includes(query);
      const matchesFilter = filter === "all"
        || (filter === "open" && !task.completed)
        || (filter === "completed" && task.completed)
        || (filter === "high" && task.priority === "high")
        || (filter === "overdue" && isTaskOverdue(task));
      return task.column === column.id && matchesQuery && matchesFilter;
    });
    return `<section class="kanban-column" data-column="${escapeHtml(column.id)}">
      <div class="column-header"><i class="column-dot" style="background:${escapeHtml(column.color)}"></i>
      <input class="column-title" aria-label="Kolomnaam" value="${escapeHtml(column.name)}" data-column-name="${escapeHtml(column.id)}">
      <span class="column-count">${state.tasks.filter(task => task.column === column.id).length}</span>
      <button class="column-menu" data-delete-column="${escapeHtml(column.id)}" aria-label="Kolom verwijderen">···</button></div>
      <div class="task-list" data-drop-column="${escapeHtml(column.id)}">${tasks.length ? tasks.map(renderTask).join("") : `<div class="empty-state">${query ? "Geen passende taken." : "Nog geen taakjes hier 🌱"}</div>`}</div>
      <button class="add-card-button" data-add-task="${escapeHtml(column.id)}">＋ Taak toevoegen</button></section>`;
  }).join("");
  renderProgress();
  attachColumnEvents();
}
function isTaskOverdue(task) {
  if (task.completed || !/^\d{4}-\d{2}-\d{2}$/.test(task.due || "")) return false;
  const [year, month, day] = task.due.split("-").map(Number);
  const dueDate = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return dueDate.getFullYear() === year && dueDate.getMonth() === month - 1 && dueDate.getDate() === day && dueDate < today;
}
function formatDueDate(due) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due || "")) return due;
  const date = new Date(`${due}T00:00:00`);
  return Number.isNaN(date.getTime()) ? due : new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short" }).format(date);
}
function renderTask(task) {
  const subtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
  const completedSubtasks = subtasks.filter(subtask => subtask.completed).length;
  const priority = task.priority || "normal";
  const assignee = task.assignee && typeof task.assignee === "object" ? task.assignee : null;
  const claimedByMe = assignee?.id === profile.id;
  const claimLabel = claimedByMe ? "Jij bent bezig · vrijgeven" : assignee ? `Bezig: ${assignee.name || "Gast"}` : "＋ Claim taak";
  return `<article class="task-card${task.completed ? " completed" : ""}" draggable="true" data-task="${escapeHtml(task.id)}">
    <div class="task-topline"><input class="task-check" type="checkbox" aria-label="Taak afvinken: ${escapeHtml(task.title)}" ${task.completed ? "checked" : ""}>
    <span class="task-title">${escapeHtml(task.title)}</span><button class="task-edit" aria-label="Taak bewerken en subtaken beheren" title="Bewerken">✎</button><button class="task-delete" aria-label="Taak verwijderen">×</button></div>
    ${task.description ? `<p class="task-description">${escapeHtml(task.description)}</p>` : ""}
    <div class="task-meta"><span class="task-tag tag-${escapeHtml(task.tone || "mint")}">${escapeHtml(task.tag || "Taak")}</span><span class="task-priority priority-${escapeHtml(priority)}">${priority === "high" ? "Hoog" : priority === "low" ? "Laag" : "Normaal"}</span>${task.due ? `<span class="task-due${isTaskOverdue(task) || task.due === "Vandaag" ? " urgent" : ""}">${escapeHtml(formatDueDate(task.due))}</span>` : ""}</div>
    ${task.completed
      ? ""
      : `<div class="task-claim${assignee ? " is-claimed" : ""}">${assignee ? `<span class="claim-person"><i style="--claim-color:${safeColor(assignee.color)}">${escapeHtml(String(assignee.name || "Gast").slice(0, 1).toUpperCase())}</i>${escapeHtml(String(assignee.name || "Gast"))} is bezig</span>` : ""}<button class="claim-button${claimedByMe ? " claimed-by-me" : ""}" aria-label="${escapeHtml(claimLabel)}" ${assignee && !claimedByMe ? "disabled" : ""}>${escapeHtml(claimLabel)}</button></div>`}
    ${subtasks.length ? `<div class="task-subtasks"><div class="subtask-heading">Subtaken <span>${completedSubtasks}/${subtasks.length}</span></div>${subtasks.map((subtask, index) => `<label class="subtask-row"><input type="checkbox" data-subtask-index="${index}" ${subtask.completed ? "checked" : ""}><span class="${subtask.completed ? "subtask-completed" : ""}">${escapeHtml(subtask.title)}</span></label>`).join("")}</div>` : `<button class="add-subtask" data-edit-task>＋ Subtaak toevoegen</button>`}
    </article>`;
}
function renderProgress() {
  const total = state.tasks.length;
  const complete = state.tasks.filter(task => task.completed).length;
  document.querySelector("#progressCount").textContent = `${complete} / ${total} taken klaar`;
  document.querySelector("#progressFill").style.width = `${total ? complete / total * 100 : 0}%`;
  document.querySelector("#progressText").textContent = complete && complete === total ? "Alles klaar, wat een team! 🎉" : complete ? "Je bent lekker bezig!" : "Elke kleine stap telt!";
}
function attachColumnEvents() {
  document.querySelectorAll(".task-card").forEach(card => {
    card.addEventListener("dragstart", () => { draggedTaskId = card.dataset.task; card.classList.add("dragging"); });
    card.addEventListener("dragend", () => { card.classList.remove("dragging"); draggedTaskId = null; });
    card.querySelector(".task-check").addEventListener("change", event => {
      const task = state.tasks.find(item => item.id === card.dataset.task);
      task.completed = event.target.checked;
      if (task.completed && Array.isArray(task.subtasks)) task.subtasks.forEach(subtask => { subtask.completed = true; });
      if (task.completed) task.assignee = null;
      saveState(); renderBoard();
      if (task.completed) launchConfetti();
    });
    card.querySelector(".claim-button")?.addEventListener("click", event => {
      const task = state.tasks.find(item => item.id === card.dataset.task);
      if (!task || task.completed) return;
      if (task.assignee?.id === profile.id) {
        task.assignee = null;
      } else if (!task.assignee) {
        task.assignee = { id: profile.id, name: profile.name, color: safeColor(profile.color) };
      } else {
        return;
      }
      saveState();
      renderBoard();
    });
    card.querySelector(".task-edit").addEventListener("click", () => {
      const task = state.tasks.find(item => item.id === card.dataset.task);
      openTaskModal(task.column, task);
    });
    card.querySelector("[data-edit-task]")?.addEventListener("click", () => {
      const task = state.tasks.find(item => item.id === card.dataset.task);
      openTaskModal(task.column, task);
    });
    card.querySelectorAll("[data-subtask-index]").forEach(checkbox => checkbox.addEventListener("change", event => {
      const task = state.tasks.find(item => item.id === card.dataset.task);
      const index = Number(event.currentTarget.dataset.subtaskIndex);
      task.subtasks[index].completed = event.currentTarget.checked;
      if (task.subtasks.length) task.completed = task.subtasks.every(subtask => subtask.completed);
      if (task.completed) task.assignee = null;
      saveState(); renderBoard();
      if (task.completed) launchConfetti();
    }));
    card.querySelector(".task-delete").addEventListener("click", () => {
      state.tasks = state.tasks.filter(item => item.id !== card.dataset.task);
      saveState(); renderBoard(); showToast("Taak verwijderd.");
    });
  });
  document.querySelectorAll(".task-list").forEach(list => {
    list.addEventListener("dragover", event => { event.preventDefault(); list.classList.add("drop-hint"); });
    list.addEventListener("dragleave", () => list.classList.remove("drop-hint"));
    list.addEventListener("drop", event => {
      event.preventDefault(); list.classList.remove("drop-hint");
      const task = state.tasks.find(item => item.id === draggedTaskId);
      if (task) { task.column = list.dataset.dropColumn; saveState(); renderBoard(); }
    });
  });
  document.querySelectorAll("[data-add-task]").forEach(button => button.addEventListener("click", () => openTaskModal(button.dataset.addTask)));
  document.querySelectorAll("[data-column-name]").forEach(input => input.addEventListener("change", () => {
    const column = state.columns.find(item => item.id === input.dataset.columnName);
    if (input.value.trim()) column.name = input.value.trim();
    else input.value = column.name;
    saveState();
  }));
  document.querySelectorAll("[data-delete-column]").forEach(button => button.addEventListener("click", () => {
    const column = state.columns.find(item => item.id === button.dataset.deleteColumn);
    if (!confirm(`Kolom "${column.name}" verwijderen? De taken gaan naar Ideeën.`)) return;
    state.tasks.forEach(task => { if (task.column === column.id) task.column = state.columns.find(item => item.id !== column.id)?.id || "ideas"; });
    state.columns = state.columns.filter(item => item.id !== column.id);
    saveState(); renderBoard();
  }));
}
function openModal({ title, description = "", fields = [], submitLabel = "Opslaan", onSubmit }) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `<form class="modal"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p>${fields.map(field => {
    const id = `modal-${escapeHtml(field.id)}`;
    const name = escapeHtml(field.id);
    const placeholder = escapeHtml(field.placeholder || "");
    if (field.type === "select") {
      return `<label for="${id}">${escapeHtml(field.label)}</label><select id="${id}" name="${name}">${field.options.map(option => `<option value="${escapeHtml(option.value)}" ${option.value === field.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}</select>`;
    }
    if (field.multiline) {
      return `<label for="${id}">${escapeHtml(field.label)}</label><textarea id="${id}" name="${name}" placeholder="${placeholder}" ${field.maxlength ? `maxlength="${field.maxlength}"` : ""}>${escapeHtml(field.value || "")}</textarea>`;
    }
    return `<label for="${id}">${escapeHtml(field.label)}</label><input id="${id}" name="${name}" type="${escapeHtml(field.type || "text")}" value="${escapeHtml(field.value || "")}" placeholder="${placeholder}" ${field.required ? "required" : ""} ${field.maxlength ? `maxlength="${field.maxlength}"` : ""}>`;
  }).join("")}<div class="modal-actions"><button type="button" data-cancel>Annuleren</button><button class="primary" type="submit">${escapeHtml(submitLabel)}</button></div></form>`;
  document.body.append(backdrop);
  backdrop.querySelector("[data-cancel]").addEventListener("click", () => backdrop.remove());
  backdrop.addEventListener("click", event => { if (event.target === backdrop) backdrop.remove(); });
  backdrop.querySelector("form").addEventListener("submit", event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    onSubmit(data);
    backdrop.remove();
  });
  backdrop.querySelector("input, textarea")?.focus();
}
function openTaskModal(columnId = state.columns[0]?.id, task = null) {
  const subtasks = Array.isArray(task?.subtasks) ? task.subtasks : [];
  openModal({ title: task ? "Taak bijwerken ✏️" : "Een taakje erbij 🌱", description: "Maak het concreet, dan wordt beginnen makkelijker.", fields: [
    { id: "title", label: "Wat gaan we doen?", placeholder: "Bijvoorbeeld: eerste schets maken", value: task?.title || "", required: true, maxlength: 100 },
    { id: "description", label: "Extra details (optioneel)", placeholder: "Een beetje context helpt...", value: task?.description || "", multiline: true },
    { id: "tag", label: "Label", placeholder: "Idee, Ontwerp, Team...", value: task?.tag || "", maxlength: 25 },
    { id: "due", label: "Deadline (optioneel)", type: "date", value: /^\d{4}-\d{2}-\d{2}$/.test(task?.due || "") ? task.due : "" },
    { id: "priority", label: "Prioriteit", type: "select", value: task?.priority || "normal", options: [
      { value: "low", label: "Laag" }, { value: "normal", label: "Normaal" }, { value: "high", label: "Hoog" }
    ] },
    { id: "subtasks", label: "Subtaken (één per regel)", placeholder: "Bijvoorbeeld:\nInspiratie verzamelen\nEerste versie maken", value: subtasks.map(subtask => subtask.title).join("\n"), multiline: true, maxlength: 1000 }
  ], submitLabel: task ? "Wijzigingen opslaan" : "Taak toevoegen", onSubmit: data => {
    const previousSubtasks = Array.isArray(task?.subtasks) ? task.subtasks : [];
    const existingSubtasks = new Map();
    previousSubtasks.forEach(subtask => {
      const key = subtask.title.trim().toLocaleLowerCase();
      existingSubtasks.set(key, [...(existingSubtasks.get(key) || []), subtask]);
    });
    const nextSubtasks = data.subtasks.split(/\r?\n/).map(title => title.trim()).filter(Boolean).map(title => {
      const previous = existingSubtasks.get(title.toLocaleLowerCase())?.shift();
      return { id: previous?.id || `subtask-${crypto.randomUUID()}`, title, completed: previous?.completed || false };
    });
    if (task) {
      task.title = data.title.trim();
      task.description = data.description.trim();
      task.tag = data.tag.trim() || "Taak";
      task.due = data.due || (/^\d{4}-\d{2}-\d{2}$/.test(task.due || "") ? "" : task.due);
      task.priority = data.priority;
      task.subtasks = nextSubtasks;
      if (nextSubtasks.length) task.completed = nextSubtasks.every(subtask => subtask.completed);
    } else {
      state.tasks.push({ id: `task-${crypto.randomUUID()}`, column: columnId, title: data.title.trim(), description: data.description.trim(), tag: data.tag.trim() || "Taak", tone: "mint", due: data.due, priority: data.priority, completed: false, subtasks: nextSubtasks });
    }
    saveState(); renderBoard(); showToast(task ? "Je taak is bijgewerkt! ✨" : "Je taak is aan het bord geplakt! 🌱");
  } });
}
function renderNotes() {
  document.querySelector("#noteCount").textContent = state.notes.length;
  document.querySelector("#notesGrid").innerHTML = state.notes.length ? state.notes.map(note => `<article class="sticky-note" data-note="${escapeHtml(note.id)}"><textarea aria-label="Notitie" maxlength="300">${escapeHtml(note.text)}</textarea><div class="sticky-note-footer"><span>een ideetje ✿</span><button aria-label="Notitie verwijderen">Verwijderen</button></div></article>`).join("") : `<p class="empty-state">Je prikbord is nog leeg. Plak er een idee op! ✨</p>`;
  document.querySelectorAll(".sticky-note").forEach(card => {
    const textarea = card.querySelector("textarea");
    textarea.addEventListener("input", () => {
      const note = state.notes.find(item => item.id === card.dataset.note);
      note.text = textarea.value; saveState();
    });
    card.querySelector("button").addEventListener("click", () => {
      state.notes = state.notes.filter(item => item.id !== card.dataset.note); saveState(); renderNotes();
    });
  });
}
function showView(name) {
  document.querySelectorAll(".nav-item,.view-tab").forEach(button => button.classList.toggle("active", button.dataset.view === name));
  document.querySelector("#boardView").classList.toggle("active", name === "board");
  document.querySelector("#mindmapView").classList.toggle("active", name === "mindmap");
  document.querySelector("#notesView").classList.toggle("active", name === "notes");
  if (name === "mindmap") drawMindmapLines();
}
function launchConfetti() {
  const canvas = document.querySelector("#confettiCanvas");
  const ctx = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * ratio; canvas.height = window.innerHeight * ratio;
  ctx.scale(ratio, ratio);
  const colors = ["#f2a36f", "#86b78e", "#e8cc64", "#ab94cf", "#80b5ca", "#f08e91"];
  const pieces = Array.from({ length: 170 }, () => ({ x: Math.random() * window.innerWidth, y: -20 - Math.random() * window.innerHeight * .5, vx: (Math.random() - .5) * 5, vy: 2 + Math.random() * 5, size: 4 + Math.random() * 6, spin: Math.random() * 6, color: colors[Math.floor(Math.random() * colors.length)] }));
  const start = performance.now();
  function frame(now) {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    pieces.forEach(piece => {
      piece.x += piece.vx; piece.y += piece.vy; piece.spin += .12; piece.vy += .025;
      ctx.save(); ctx.translate(piece.x, piece.y); ctx.rotate(piece.spin); ctx.fillStyle = piece.color; ctx.fillRect(-piece.size / 2, -piece.size / 2, piece.size, piece.size * .65); ctx.restore();
    });
    if (now - start < 2600) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }
  requestAnimationFrame(frame);
  showToast("Taak afgevinkt! Lekker bezig! 🎉");
}
function drawMindmapLines() {
  const canvas = document.querySelector("#mindmapCanvas");
  const svg = document.querySelector("#mindmapLines");
  const root = canvas.querySelector('[data-node="center"]');
  if (!root) return;
  const bounds = canvas.getBoundingClientRect();
  const center = root.getBoundingClientRect();
  svg.setAttribute("viewBox", `0 0 ${bounds.width} ${bounds.height}`);
  svg.innerHTML = "";
  canvas.querySelectorAll(".mind-node:not(.central-node)").forEach(node => {
    const rect = node.getBoundingClientRect();
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", center.left - bounds.left + center.width / 2);
    line.setAttribute("y1", center.top - bounds.top + center.height / 2);
    line.setAttribute("x2", rect.left - bounds.left + rect.width / 2);
    line.setAttribute("y2", rect.top - bounds.top + rect.height / 2);
    svg.append(line);
  });
}
function enableMindmapDragging() {
  const canvas = document.querySelector("#mindmapCanvas");
  canvas.querySelectorAll(".mind-node").forEach(node => {
    node.addEventListener("pointerdown", event => {
      if (event.target.closest("button")) return;
      const nodeRect = node.getBoundingClientRect(), canvasRect = canvas.getBoundingClientRect();
      const offsetX = event.clientX - nodeRect.left, offsetY = event.clientY - nodeRect.top;
      node.setPointerCapture(event.pointerId);
      const move = moveEvent => {
        const x = Math.max(0, Math.min(canvasRect.width - nodeRect.width, moveEvent.clientX - canvasRect.left - offsetX));
        const y = Math.max(0, Math.min(canvasRect.height - nodeRect.height, moveEvent.clientY - canvasRect.top - offsetY));
        node.style.left = `${x}px`; node.style.top = `${y}px`; node.style.right = "auto";
        drawMindmapLines();
      };
      const up = () => { node.removeEventListener("pointermove", move); node.removeEventListener("pointerup", up); };
      node.addEventListener("pointermove", move); node.addEventListener("pointerup", up);
    });
  });
}
async function openRoomDialog() {
  if (!supabaseClient && !await connectSupabase()) return;
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `<section class="modal"><h2>Samen aan de slag? 💚</h2><p>Deel een roomcode met je team. Iedereen met de code kan het bord bekijken en aanpassen.</p><label for="room-name">Jouw naam</label><input id="room-name" maxlength="24" value="${escapeHtml(profile.name)}" placeholder="Hoe mogen anderen je noemen?"><label for="room-code">Roomcode</label><input id="room-code" maxlength="20" placeholder="Voer een bestaande roomcode in"><div class="modal-actions modal-room-actions"><button type="button" data-backend>Instellingen</button><button type="button" data-cancel>Sluiten</button><button type="button" class="primary" data-join>Room joinen</button><button type="button" class="primary" data-create>Nieuwe room</button></div></section>`;
  document.body.append(backdrop);
  const close = () => backdrop.remove();
  backdrop.querySelector("[data-cancel]").addEventListener("click", close);
  backdrop.addEventListener("click", event => { if (event.target === backdrop) close(); });
  backdrop.querySelector("[data-backend]").addEventListener("click", () => { close(); openBackendDialog(); });
  backdrop.querySelector("[data-join]").addEventListener("click", async () => {
    const roomId = backdrop.querySelector("#room-code").value.trim().toUpperCase();
    if (!/^[A-F0-9]{20}$/.test(roomId)) { showToast("Vul een geldige roomcode van 20 tekens in."); return; }
    if (!saveNameFromRoomDialog(backdrop)) return;
    if (await joinRoom(roomId, null)) { close(); navigator.clipboard?.writeText(location.href.split("?")[0] + `?room=${encodeURIComponent(roomId)}`).catch(() => {}); }
  });
  backdrop.querySelector("[data-create]").addEventListener("click", async () => {
    if (!saveNameFromRoomDialog(backdrop)) return;
    if (await joinRoom("", state)) {
      const roomId = activeRoomId;
      close();
      const shareUrl = location.href.split("?")[0] + `?room=${encodeURIComponent(roomId)}`;
      try { await navigator.clipboard.writeText(shareUrl); showToast(`Room ${roomId} aangemaakt. De uitnodigingslink is gekopieerd!`); }
      catch { showToast(`Room ${roomId} aangemaakt. Deel deze code met je team.`); }
    }
  });
  return backdrop;
}
function saveNameFromRoomDialog(backdrop) {
  const name = backdrop.querySelector("#room-name").value.trim();
  if (!name) { showToast("Vul je naam in zodat anderen je herkennen."); return false; }
  profile.name = name.slice(0, 24);
  saveProfile();
  return true;
}
function openBackendDialog() {
  let config = {};
  try { config = JSON.parse(localStorage.getItem(BACKEND_KEY) || "null") || DEFAULT_SUPABASE_CONFIG; }
  catch (error) { console.error("Supabase-instellingen konden niet worden gelezen:", error); }
  openModal({ title: "Realtime instellen ⚙", description: "Vul de Project URL en anon/publishable key van je eigen Supabase-project in. Deze gegevens worden alleen in deze browser bewaard.", fields: [
    { id: "url", label: "Supabase Project URL", placeholder: "https://jouw-project.supabase.co", required: true },
    { id: "key", label: "Anon / publishable key", placeholder: "sb_publishable_... of de legacy anon key", required: true },
  ], submitLabel: "Verbinden", onSubmit: async data => {
    const url = data.url.trim().replace(/\/+$/, "");
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) { showToast("Vul een geldige Supabase Project URL in."); return; }
    try { localStorage.setItem(BACKEND_KEY, JSON.stringify({ url, key: data.key.trim() })); }
    catch (error) { console.error("Supabase-instellingen opslaan mislukte:", error); showToast("Instellingen konden niet worden opgeslagen."); return; }
    if (await connectSupabase()) showToast("Supabase verbonden. Je kunt nu een room aanmaken of joinen.");
  } });
  const fields = document.querySelectorAll(".modal input");
  if (fields.length === 2) {
    fields[0].value = config.url || "";
    fields[1].value = config.key || "";
  }
}
document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => showView(button.dataset.view)));
document.querySelector("#searchInput").addEventListener("input", renderBoard);
document.querySelector("#filterSelect").addEventListener("change", renderBoard);
document.querySelector("#themeToggle").addEventListener("click", () => {
  const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(theme);
  try { localStorage.setItem(THEME_KEY, theme); }
  catch (error) {
    console.error("Thema-instelling kon niet worden opgeslagen:", error);
    showToast("Je thema is gewijzigd, maar kon niet worden opgeslagen.");
  }
});
document.querySelector("#addTaskButton").addEventListener("click", () => openTaskModal());
document.querySelector("#addNoteButton").addEventListener("click", () => {
  state.notes.unshift({ id: `note-${Date.now()}`, text: "" }); saveState(); renderNotes();
  document.querySelector(".sticky-note textarea")?.focus();
});
document.querySelector("#addColumn").addEventListener("click", () => {
  const name = prompt("Hoe heet je nieuwe kolom?");
  if (!name?.trim()) return;
  state.columns.push({ id: `column-${Date.now()}`, name: name.trim().slice(0, 30), color: "#88a987" });
  saveState(); renderBoard();
});
document.querySelector("#addBoard").addEventListener("click", () => showToast("Je kunt meerdere ideeën kwijt op dit bord!"));
document.querySelector("#roomButton").addEventListener("click", openRoomDialog);
document.querySelector("#backendButton").addEventListener("click", openBackendDialog);
document.querySelector("#inviteButton").addEventListener("click", openRoomDialog);
document.querySelector("#inviteAvatar").addEventListener("click", openRoomDialog);
document.querySelector("#shareButton").addEventListener("click", async () => {
  const shareUrl = activeRoomId ? `${location.href.split("?")[0]}?room=${encodeURIComponent(activeRoomId)}` : location.href;
  try { await navigator.clipboard.writeText(shareUrl); showToast(activeRoomId ? "Uitnodigingslink gekopieerd!" : "Link naar het bord gekopieerd!"); }
  catch { showToast("Kopiëren lukte niet. Kopieer de link uit je adresbalk."); }
});
document.querySelector("#helpButton").addEventListener("click", () => showToast("Sleep taken, voeg subtaken toe, stel deadlines in en filter op prioriteit!"));
document.querySelector("#moreButton").addEventListener("click", () => showToast(activeRoomId ? "Je bord synchroniseert met iedereen in deze room." : "Je bord wordt automatisch bewaard op dit apparaat."));
document.querySelector("#renameBoard").addEventListener("click", () => {
  openModal({ title: "Bordnaam wijzigen", description: "Geef je bord een herkenbare naam.", fields: [
    { id: "boardTitle", label: "Bordnaam", value: state.boardTitle, required: true, maxlength: 60 }
  ], submitLabel: "Naam opslaan", onSubmit: data => {
    state.boardTitle = data.boardTitle.trim();
    renderBoardTitle();
    saveState();
    showToast("Bordnaam opgeslagen.");
  } });
});
document.querySelector("#addMindNode").addEventListener("click", () => {
  const idea = prompt("Welk idee wil je toevoegen?");
  if (!idea?.trim()) return;
  const node = document.createElement("div");
  node.className = "mind-node yellow-node"; node.innerHTML = `💡<strong>${escapeHtml(idea.trim().slice(0, 50))}</strong><small>Nieuw idee</small>`;
  node.style.left = `${12 + Math.random() * 64}%`; node.style.top = `${12 + Math.random() * 65}%`;
  document.querySelector("#mindmapCanvas").append(node); enableMindmapDragging(); drawMindmapLines();
});
window.addEventListener("resize", drawMindmapLines);
document.addEventListener("pointermove", publishCursor);
document.querySelector("#todayLabel").textContent = new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long" }).format(new Date()).toLocaleUpperCase("nl-NL");
applyTheme(loadTheme());
renderBoardTitle();
renderBoard();
renderNotes();
enableMindmapDragging();
drawMindmapLines();
saveProfile();
const requestedRoom = new URLSearchParams(location.search).get("room");
if (requestedRoom) {
  openRoomDialog().then(backdrop => {
    if (!backdrop) return;
    const roomInput = document.querySelector("#room-code");
    if (roomInput) {
      roomInput.value = requestedRoom.toUpperCase();
      document.querySelector(".modal [data-join]").click();
    }
  });
}
