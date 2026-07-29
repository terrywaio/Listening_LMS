const APP_VERSION = "20260729-dialogue-materials-4";
const STORAGE_PREFIX = "listening-lab-lms:v1:";
const AUDIO_CACHE_NAME = "listening-lab-audio-v1";
const MAX_PRE_SUBMIT_LISTENS = 8;
const LISTEN_COUNT_CONFIRM_SECONDS = 0.4;
const AUDIO_PRELOAD_ATTEMPTS = 3;
const AUDIO_PRELOAD_RETRY_DELAY_MS = 900;
const ASSIGNMENT_INSERT_ATTEMPTS = 3;
const ASSIGNMENT_RETRY_DELAY_MS = 900;
const STUDENT_AUTH_DOMAIN = "students.listeninglab.app";
const FIXED_STUDENT_PASSWORD = "123456";
const FIXED_TEACHERS = [
  { email: "chensijruth@gmail.com", name: "老师 1" },
  { email: "terrywai7114@gmail.com", name: "老师 2" },
];
const FIXED_STUDENTS = [
  { key: "hty", name: "HTY", email: `student-hty@${STUDENT_AUTH_DOMAIN}` },
  { key: "xumaoheng", name: "xumaoheng", email: `student-xumaoheng@${STUDENT_AUTH_DOMAIN}` },
  { key: "student2", name: "学生2", email: `student-2@${STUDENT_AUTH_DOMAIN}` },
  { key: "student3", name: "学生3", email: `student-3@${STUDENT_AUTH_DOMAIN}` },
  { key: "student4", name: "学生4", email: `student-4@${STUDENT_AUTH_DOMAIN}` },
  { key: "wukeshun-kevin", name: "吴可舜kevin", email: `student-wukeshun-kevin@${STUDENT_AUTH_DOMAIN}` },
];

const state = {
  configReady: false,
  supabase: null,
  session: null,
  profile: null,
  authReady: false,
  authLoading: true,
  authLoadToken: 0,
  authError: "",
  pendingProfileName: "",
  authMode: "student",
  library: [],
  students: [],
  teacherAssignments: [],
  teacherAssignmentProgressRows: [],
  teacherProgressRows: [],
  teacherLessonDetails: {},
  selectedTeacherAssignmentId: "",
  studentAssignments: [],
  studentProgressRows: [],
  assignment: null,
  lesson: normalizeLesson({ title: "未选择任务", segments: [] }),
  lessonPath: "",
  lessonUrl: "",
  audioSourceUrl: "",
  audioObjectUrl: "",
  pendingAudioObjectUrl: "",
  audioLoadController: null,
  audioLoadToken: 0,
  audioIsBuffering: false,
  currentIndex: 0,
  answers: {},
  submitted: {},
  playedThrough: {},
  listenCounts: {},
  scores: {},
  submittedAt: {},
  unlockedIndex: 0,
  notes: "",
  waveform: null,
  activeListenSegmentId: "",
  pendingListenAttempt: null,
  saving: false,
  pendingSaveSegmentId: "",
  pendingSaveRequested: false,
  materialEditor: {
    drafts: [],
    activeIndex: -1,
  },
};

const els = {};
let cloudSaveTimer = null;

const lessonRepository = {
  async list() {
    const response = await fetch(`./library.json?v=${APP_VERSION}`, { cache: "no-store" });
    if (!response.ok) throw new Error("library not found");
    const library = await response.json();
    return Array.isArray(library.lessons) ? library.lessons : [];
  },
  async load(path) {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) throw new Error("lesson not found");
    return response.json();
  },
};

document.addEventListener("DOMContentLoaded", async () => {
  bindElements();
  renderFixedStudentOptions();
  hydrateAuthForm();
  bindEvents();
  setAuthMode(state.authMode);
  initializeSupabase();
  await loadLibrary();
  await initializeAuth();
  renderShell();
  resizeWaveform();
  window.addEventListener("resize", () => {
    resizeWaveform();
    drawWaveform();
  });
});

function bindElements() {
  [
    "appStatus",
    "userBadge",
    "signOutButton",
    "authView",
    "appView",
    "configStatus",
    "authStatus",
    "studentModeButton",
    "teacherModeButton",
    "studentAuthPanel",
    "teacherAuthPanel",
    "studentLoginSelect",
    "studentPasswordInput",
    "teacherEmailSelect",
    "passwordInput",
    "signInButton",
    "signUpButton",
    "studentTasksPanel",
    "assignmentCount",
    "assignmentList",
    "practicePanel",
    "lessonMeta",
    "segmentCounter",
    "syncStatus",
    "waveform",
    "audio",
    "previousSegment",
    "replaySegment",
    "togglePlay",
    "nextSegment",
    "timeRange",
    "sentenceStatus",
    "speakerBadge",
    "listenCountBadge",
    "scoreBadge",
    "answerText",
    "dictationInput",
    "checkAnswer",
    "copySegment",
    "audioStatus",
    "progressPanel",
    "progressText",
    "progressSummary",
    "notesInput",
    "teacherPanel",
    "teacherStatus",
    "studentSelect",
    "teacherLessonSelect",
    "dueAtInput",
    "assignmentNote",
    "assignTaskButton",
    "studentsList",
    "refreshTeacherData",
    "teacherCompletionMatrix",
    "teacherAssignments",
    "teacherProgress",
    "materialSourceSelect",
    "loadMaterialButton",
    "newDialogueMaterialButton",
    "materialImportInput",
    "materialBatchSelect",
    "removeMaterialDraftButton",
    "materialEditorStatus",
    "materialEditorEmpty",
    "materialEditorForm",
    "materialTypeInput",
    "materialTitleInput",
    "materialSourceInput",
    "materialAudioInput",
    "materialSpeakers",
    "addMaterialSpeakerButton",
    "materialSegments",
    "addMaterialSegmentButton",
    "exportMaterialButton",
    "exportMaterialBatchButton",
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });
}

function bindEvents() {
  on(els.signInButton, "click", signIn);
  on(els.signUpButton, "click", signUp);
  on(els.studentModeButton, "click", () => setAuthMode("student"));
  on(els.teacherModeButton, "click", () => setAuthMode("teacher"));
  on(els.signOutButton, "click", signOut);
  on(els.assignTaskButton, "click", assignTask);
  on(els.refreshTeacherData, "click", loadTeacherDashboard);
  on(els.previousSegment, "click", () => moveSegment(-1));
  on(els.nextSegment, "click", () => moveSegment(1));
  on(els.replaySegment, "click", () => playCurrentSegment(true));
  on(els.togglePlay, "click", togglePlay);
  on(els.waveform, "click", seekFromWaveform);
  on(els.audio, "loadedmetadata", () => {
    enforceNormalPlaybackRate();
    const readyText = els.audio.src.startsWith("blob:") ? "本地缓存音频已就绪" : "音频已就绪";
    setAudioStatus(`${formatTime(els.audio.duration)} ${readyText}`);
    drawWaveform();
  });
  on(els.audio, "ratechange", enforceNormalPlaybackRate);
  on(els.audio, "timeupdate", onAudioTimeUpdate);
  on(els.audio, "play", () => {
    els.togglePlay.textContent = "Ⅱ";
  });
  on(els.audio, "playing", () => {
    state.audioIsBuffering = false;
    confirmPendingListenAttempt();
  });
  on(els.audio, "pause", () => {
    els.togglePlay.textContent = "▶";
    usePendingCachedAudio();
  });
  on(els.audio, "waiting", () => {
    state.audioIsBuffering = true;
    setAudioStatus("音频缓冲中；未真正播出的尝试不会扣次数。", "warning");
  });
  on(els.audio, "stalled", () => {
    state.audioIsBuffering = true;
    setAudioStatus("音频网络中断，正在等待恢复；未真正播出的尝试不会扣次数。", "warning");
  });
  on(els.audio, "error", () => {
    cancelPendingListenAttempt();
    setAudioStatus("音频加载失败，本次不扣次数。请重新点击播放或刷新页面。", "danger");
    renderPractice();
  });
  on(els.dictationInput, "input", () => {
    const segment = currentSegment();
    if (!segment) return;
    state.answers[segment.id] = els.dictationInput.value;
    if (isSubmitted(segment)) {
      state.scores[segment.id] = scoreAnswer(segmentAnswerText(segment), els.dictationInput.value.trim());
    }
    saveLocalProgress();
    scheduleCloudSave(segment);
    updateScoreBadge(segment);
  });
  on(els.dictationInput, "paste", (event) => {
    const segment = currentSegment();
    if (isStudent() && segment && !isSubmitted(segment)) {
      event.preventDefault();
      setAudioStatus("提交前不能粘贴答案");
    }
  });
  on(els.answerText, "copy", (event) => {
    const segment = currentSegment();
    if (!segment || !isSubmitted(segment)) {
      event.preventDefault();
    }
  });
  on(els.checkAnswer, "click", submitAnswer);
  on(els.copySegment, "click", copyCurrentSegment);
  on(els.notesInput, "input", () => {
    state.notes = els.notesInput.value;
    saveLocalProgress();
    scheduleCloudSave(null);
  });
  on(els.loadMaterialButton, "click", loadSelectedMaterialForEditor);
  on(els.newDialogueMaterialButton, "click", createDialogueMaterialDraft);
  on(els.materialImportInput, "change", importMaterialFiles);
  on(els.materialBatchSelect, "change", () => {
    state.materialEditor.activeIndex = Number(els.materialBatchSelect.value);
    renderMaterialEditor();
  });
  on(els.removeMaterialDraftButton, "click", removeCurrentMaterialDraft);
  on(els.materialTypeInput, "change", updateMaterialMeta);
  on(els.materialTitleInput, "input", updateMaterialMeta);
  on(els.materialSourceInput, "input", updateMaterialMeta);
  on(els.materialAudioInput, "input", updateMaterialMeta);
  on(els.addMaterialSpeakerButton, "click", addMaterialSpeaker);
  on(els.materialSpeakers, "input", updateMaterialSpeaker);
  on(els.materialSpeakers, "click", handleMaterialSpeakerAction);
  on(els.addMaterialSegmentButton, "click", addMaterialSegment);
  on(els.materialSegments, "input", updateMaterialSegment);
  on(els.materialSegments, "change", updateMaterialSegment);
  on(els.materialSegments, "click", handleMaterialSegmentAction);
  on(els.exportMaterialButton, "click", exportCurrentMaterial);
  on(els.exportMaterialBatchButton, "click", exportMaterialBatch);
  window.addEventListener("keydown", handleKeyboard);
}

function on(element, eventName, handler) {
  if (element) element.addEventListener(eventName, handler);
}

function initializeSupabase() {
  const config = window.LISTENING_LAB_SUPABASE || {};
  const hasClient = Boolean(window.supabase && window.supabase.createClient);
  const hasConfig = isFilledSupabaseConfig(config);
  state.configReady = hasClient && hasConfig;

  if (!hasClient) {
    setConfigStatus("Supabase SDK 加载失败", "danger");
    return;
  }
  if (!hasConfig) {
    setConfigStatus("请先填写 supabase-config.js", "warning");
    return;
  }

  state.supabase = window.supabase.createClient(config.url, config.anonKey);
  setConfigStatus("Supabase 已连接", "");
}

function isFilledSupabaseConfig(config) {
  return (
    typeof config.url === "string" &&
    config.url.startsWith("https://") &&
    typeof config.anonKey === "string" &&
    config.anonKey.length > 30 &&
    !config.anonKey.includes("YOUR_")
  );
}

function setConfigStatus(text, tone) {
  els.configStatus.textContent = text;
  els.configStatus.className = "status-pill";
  if (tone) els.configStatus.classList.add(`is-${tone}`);
}

async function initializeAuth() {
  state.authReady = false;
  state.authLoading = true;
  state.authError = "";
  disableAuthControls(true);
  renderShell();

  if (!state.supabase) {
    state.authReady = true;
    state.authLoading = false;
    setAuthStatus("Supabase 未配置，先按文档创建项目并填写 anon key。");
    disableAuthControls(true);
    renderShell();
    return;
  }

  state.supabase.auth.onAuthStateChange((event, session) => {
    if (event === "INITIAL_SESSION") return;
    state.session = session;
    handleSessionChanged();
  });

  const { data, error } = await state.supabase.auth.getSession();
  if (error) {
    state.authError = error.message;
    setAuthStatus(error.message);
  }
  state.session = data?.session || null;
  await handleSessionChanged();
}

async function signIn() {
  if (!state.supabase) return;
  const email = selectedTeacherEmail();
  const password = els.passwordInput.value;
  if (!email || !isFixedTeacherEmail(email)) {
    setAuthStatus("请选择固定老师账号。");
    return;
  }
  if (!password) {
    setAuthStatus("请输入老师密码。");
    return;
  }
  setAuthStatus("登录中...");
  disableAuthControls(true);
  const { error } = await state.supabase.auth.signInWithPassword({ email, password });
  if (error) {
    setAuthStatus(error.message);
    disableAuthControls(false);
  }
}

async function signUp() {
  if (!state.supabase) return;
  const student = selectedFixedStudent();
  if (!student) {
    setAuthStatus("请选择学生账号。");
    return;
  }
  const password = els.studentPasswordInput.value;
  if (!password) {
    setAuthStatus("请输入学生密码。");
    return;
  }

  state.pendingProfileName = student.name;
  localStorage.setItem(studentSelectionKey(), student.key);
  localStorage.setItem(studentNameKey(), student.name);
  const email = student.email;
  setAuthStatus("正在进入学生端...");
  disableAuthControls(true);
  const signInResult = await state.supabase.auth.signInWithPassword({ email, password });
  if (!signInResult.error) {
    setAuthStatus("已进入学生端。正在同步同名历史记录...");
    return;
  }

  const shouldCreate = isMissingStudentAccountError(signInResult.error);
  if (!shouldCreate) {
    disableAuthControls(false);
    setAuthStatus(signInResult.error.message);
    return;
  }

  const signUpResult = await state.supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: student.name,
        student_login_name: student.key,
        role: "student",
      },
    },
  });
  if (signUpResult.error) {
    if (isAlreadyRegisteredError(signUpResult.error)) {
      const retryResult = await state.supabase.auth.signInWithPassword({ email, password });
      if (!retryResult.error) {
        setAuthStatus("已进入学生端。正在同步同名历史记录...");
        return;
      }
      setAuthStatus(`学生账号已存在，但无法登录：${retryResult.error.message}`);
    } else if (isRateLimitError(signUpResult.error)) {
      setAuthStatus("Supabase Auth 正在限流，请稍后再试；同名学生账号只会创建一次。");
    } else {
      setAuthStatus(signUpResult.error.message);
    }
    disableAuthControls(false);
    return;
  }
  setAuthStatus("已进入学生端。老师分配任务后会显示在这里。");
}

function isMissingStudentAccountError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("invalid login credentials") || message.includes("email not confirmed");
}

function isAlreadyRegisteredError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("already registered") || message.includes("already been registered") || message.includes("user already exists");
}

function isRateLimitError(error) {
  return String(error?.message || "").toLowerCase().includes("rate limit");
}

function isMissingRpcError(error) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "");
  return code === "PGRST202" || message.includes("save_student_progress") || (message.includes("function") && message.includes("not found"));
}

async function signOut() {
  if (!state.supabase) return;
  clearTimeout(cloudSaveTimer);
  setAuthStatus("正在退出...");
  disableAuthControls(true);
  const { error } = await state.supabase.auth.signOut();
  if (error) {
    setAuthStatus(`退出失败：${error.message}`);
    disableAuthControls(false);
  }
}

async function handleSessionChanged() {
  const loadToken = ++state.authLoadToken;
  state.authLoading = true;
  state.authError = "";
  renderShell();

  if (!state.session) {
    resetUserState();
    if (loadToken !== state.authLoadToken) return;
    state.authReady = true;
    state.authLoading = false;
    disableAuthControls(false);
    setAuthStatus("等待登录");
    renderShell();
    return;
  }

  try {
    state.profile = await ensureProfile();
    if (isFixedTeacherEmail(state.session.user.email) && state.profile.role !== "teacher") {
      throw new Error("固定老师账号还没有初始化为 teacher，请先运行老师账号 SQL。");
    }
    if (isTeacher()) {
      await loadTeacherDashboard();
    } else {
      await reconcileStudentIdentity();
      await loadStudentAssignments();
    }
  } catch (error) {
    if (loadToken !== state.authLoadToken) return;
    state.authError = `账号数据加载失败：${error.message}`;
    setAuthStatus(state.authError);
    disableAuthControls(false);
  } finally {
    if (loadToken !== state.authLoadToken) return;
    state.authReady = true;
    state.authLoading = false;
    renderShell();
  }
}

function resetUserState() {
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = null;
  state.profile = null;
  state.students = [];
  state.teacherAssignments = [];
  state.teacherAssignmentProgressRows = [];
  state.teacherProgressRows = [];
  state.teacherLessonDetails = {};
  state.selectedTeacherAssignmentId = "";
  state.studentAssignments = [];
  state.studentProgressRows = [];
  state.assignment = null;
  state.saving = false;
  state.pendingSaveSegmentId = "";
  state.pendingSaveRequested = false;
  state.materialEditor.drafts = [];
  state.materialEditor.activeIndex = -1;
  renderMaterialEditor();
  clearPracticeData();
}

async function ensureProfile() {
  const user = state.session.user;
  const preferredName = preferredProfileName(user);
  const fixedTeacher = fixedTeacherForEmail(user.email);
  const { data, error } = await state.supabase
    .from("profiles")
    .select("id,email,full_name,role,created_at")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (data) {
    if (fixedTeacher && data.role !== "teacher") return data;
    if (preferredName && data.role === "student" && data.full_name !== preferredName) {
      const { data: updated, error: updateError } = await state.supabase
        .from("profiles")
        .update({ full_name: preferredName, email: user.email || data.email || null })
        .eq("id", user.id)
        .select("id,email,full_name,role,created_at")
        .single();
      if (!updateError && updated) return updated;
      return { ...data, full_name: preferredName };
    }
    return data;
  }
  if (fixedTeacher) {
    throw new Error("固定老师账号还没有创建 profile，请先运行老师账号 SQL。");
  }

  const fallbackName = preferredName || user.email?.split("@")[0] || "Student";
  const { error: insertError } = await state.supabase.from("profiles").insert({
    id: user.id,
    email: user.email || null,
    full_name: fallbackName,
    role: "student",
  });
  if (insertError && insertError.code !== "23505") throw insertError;

  const { data: created, error: fetchError } = await state.supabase
    .from("profiles")
    .select("id,email,full_name,role,created_at")
    .eq("id", user.id)
    .single();
  if (fetchError) throw fetchError;
  return created;
}

function preferredProfileName(user) {
  return (
    state.pendingProfileName ||
    localStorage.getItem(studentNameKey()) ||
    user?.user_metadata?.full_name ||
    user?.email?.split("@")[0] ||
    ""
  );
}

async function reconcileStudentIdentity() {
  if (!state.supabase || !isStudent()) return;
  const fullName = preferredProfileName(state.session.user) || state.profile.full_name || "";
  if (!fullName.trim()) return;
  const { error } = await state.supabase.rpc("merge_student_identity_by_name", { p_full_name: fullName.trim() });
  if (error) {
    const message = String(error.message || "");
    if (message.includes("merge_student_identity_by_name") || message.includes("Could not find the function")) {
      setAuthStatus("学生账号已进入；同名历史记录合并 SQL 还未运行。");
      return;
    }
    throw error;
  }
  state.profile.full_name = fullName.trim();
}

function hydrateAuthForm() {
  const studentKey = localStorage.getItem(studentSelectionKey());
  if (studentKey && els.studentLoginSelect) {
    els.studentLoginSelect.value = studentKey;
  }
}

function renderFixedStudentOptions() {
  if (!els.studentLoginSelect) return;
  els.studentLoginSelect.innerHTML = "";
  FIXED_STUDENTS.forEach((student) => {
    const option = document.createElement("option");
    option.value = student.key;
    option.textContent = student.name;
    els.studentLoginSelect.appendChild(option);
  });
}

function setAuthMode(mode) {
  state.authMode = mode === "teacher" ? "teacher" : "student";
  const isTeacherMode = state.authMode === "teacher";
  els.studentAuthPanel?.classList.toggle("is-hidden", isTeacherMode);
  els.teacherAuthPanel?.classList.toggle("is-hidden", !isTeacherMode);
  els.studentModeButton?.classList.toggle("is-active", !isTeacherMode);
  els.teacherModeButton?.classList.toggle("is-active", isTeacherMode);
  els.studentModeButton?.setAttribute("aria-selected", String(!isTeacherMode));
  els.teacherModeButton?.setAttribute("aria-selected", String(isTeacherMode));
}

function selectedTeacherEmail() {
  return String(els.teacherEmailSelect?.value || "").trim().toLowerCase();
}

function selectedFixedStudent() {
  const key = String(els.studentLoginSelect?.value || "").trim();
  return FIXED_STUDENTS.find((student) => student.key === key) || FIXED_STUDENTS[0] || null;
}

function isFixedTeacherEmail(email) {
  return Boolean(fixedTeacherForEmail(email));
}

function fixedTeacherForEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  return FIXED_TEACHERS.find((teacher) => teacher.email === normalized) || null;
}

async function loadLibrary() {
  try {
    state.library = await lessonRepository.list();
  } catch (error) {
    state.library = [];
  }
  renderTeacherLessonOptions();
  renderMaterialSourceOptions();
}

async function loadTeacherDashboard() {
  if (!isTeacher()) return;
  els.teacherStatus.textContent = "加载中...";
  const [studentsResult, assignmentsResult] = await Promise.all([
    state.supabase.from("profiles").select("id,email,full_name,created_at").eq("role", "student").order("created_at"),
    state.supabase
      .from("assignments")
      .select("*")
      .eq("teacher_id", state.session.user.id)
      .order("created_at", { ascending: false }),
  ]);

  if (studentsResult.error) throw studentsResult.error;
  if (assignmentsResult.error) throw assignmentsResult.error;

  state.students = studentsResult.data || [];
  state.teacherAssignments = assignmentsResult.data || [];
  await loadTeacherProgressRows();
  if (!state.selectedTeacherAssignmentId && state.teacherAssignments.length) {
    state.selectedTeacherAssignmentId = state.teacherAssignments[0].id;
  }
  await ensureTeacherSelectedLessonLoaded();
  renderTeacherDashboard();
}

async function ensureTeacherSelectedLessonLoaded() {
  const assignment = state.teacherAssignments.find((item) => item.id === state.selectedTeacherAssignmentId);
  if (!assignment || !assignment.lesson_path) return;
  if (state.teacherLessonDetails[assignment.lesson_path]) return;
  try {
    const rawLesson = await lessonRepository.load(assignment.lesson_path);
    state.teacherLessonDetails[assignment.lesson_path] = { lesson: normalizeLesson(rawLesson) };
  } catch (error) {
    state.teacherLessonDetails[assignment.lesson_path] = { error: error.message || String(error) };
  }
}

async function loadTeacherProgressRows() {
  const ids = state.teacherAssignments.map((assignment) => assignment.id);
  if (!ids.length) {
    state.teacherAssignmentProgressRows = [];
    state.teacherProgressRows = [];
    return;
  }
  const [assignmentProgressResult, segmentProgressResult] = await Promise.all([
    state.supabase.from("assignment_progress").select("*").in("assignment_id", ids),
    state.supabase.from("segment_progress").select("*").in("assignment_id", ids).order("segment_index", { ascending: true }),
  ]);
  if (assignmentProgressResult.error) throw assignmentProgressResult.error;
  if (segmentProgressResult.error) throw segmentProgressResult.error;
  state.teacherAssignmentProgressRows = assignmentProgressResult.data || [];
  state.teacherProgressRows = segmentProgressResult.data || [];
}

async function assignTask() {
  if (!isTeacher()) return;
  const studentId = els.studentSelect.value;
  const lessonPath = els.teacherLessonSelect.value;
  const lessonMeta = state.library.find((lesson) => lesson.path === lessonPath);
  if (!studentId || !lessonMeta) {
    els.teacherStatus.textContent = "请选择学生和课包";
    return;
  }

  els.teacherStatus.textContent = "正在分配...";
  if (els.assignTaskButton) els.assignTaskButton.disabled = true;
  try {
    let lessonTitle = lessonMeta.title || lessonPath;
    let segmentCount = Number(lessonMeta.segmentCount || 0);
    try {
      const rawLesson = await lessonRepository.load(lessonPath);
      const lesson = normalizeLesson(rawLesson);
      lessonTitle = lesson.title || lessonTitle;
      segmentCount = lesson.segments.length || segmentCount;
    } catch (lessonError) {
      console.warn("Lesson preload failed; assigning from library metadata.", lessonError);
    }
    const dueAt = els.dueAtInput.value ? new Date(els.dueAtInput.value).toISOString() : null;
    const payload = {
      teacher_id: state.session.user.id,
      student_id: studentId,
      lesson_title: lessonTitle,
      lesson_path: lessonPath,
      lesson_segment_count: segmentCount,
      due_at: dueAt,
      note: els.assignmentNote.value.trim() || null,
      source_type: "static_lesson",
      content_ref: {
        path: lessonPath,
        title: lessonTitle,
        materialType: normalizeMaterialType(lessonMeta.materialType || lessonMeta.category),
        futureItemType: "sentence_item_set",
      },
    };
    await insertAssignmentWithRetry(payload);
    els.assignmentNote.value = "";
    els.teacherStatus.textContent = "任务已分配";
    await loadTeacherDashboard();
  } catch (error) {
    console.error("Assignment failed", error);
    els.teacherStatus.textContent = `分配失败：${teacherAssignmentErrorMessage(error)}`;
  } finally {
    if (els.assignTaskButton) els.assignTaskButton.disabled = false;
  }
}

async function insertAssignmentWithRetry(payload) {
  let lastError = null;
  for (let attempt = 1; attempt <= ASSIGNMENT_INSERT_ATTEMPTS; attempt += 1) {
    try {
      const { error } = await state.supabase.from("assignments").insert(payload);
      if (!error) return;
      lastError = error;
    } catch (error) {
      lastError = error;
    }

    if (!isRetryableAssignmentError(lastError) || attempt === ASSIGNMENT_INSERT_ATTEMPTS) break;
    els.teacherStatus.textContent = `网络不稳定，正在重试 ${attempt + 1}/${ASSIGNMENT_INSERT_ATTEMPTS}...`;
    await delay(ASSIGNMENT_RETRY_DELAY_MS * attempt);
  }

  if (isFetchLikeError(lastError)) {
    els.teacherStatus.textContent = "Supabase SDK 请求失败，正在用备用通道重试...";
    await insertAssignmentViaRest(payload, lastError);
    return;
  }

  throw lastError || new Error("未知分配错误");
}

async function insertAssignmentViaRest(payload, originalError) {
  const config = window.LISTENING_LAB_SUPABASE || {};
  const accessToken = state.session?.access_token;
  if (!config.url || !config.anonKey || !accessToken) throw originalError || new Error("缺少 Supabase 登录状态");

  const response = await fetch(`${config.url}/rest/v1/assignments`, {
    method: "POST",
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const error = new Error(body || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
}

function isRetryableAssignmentError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return isFetchLikeError(error) || message.includes("timeout") || message.includes("network") || message.includes("temporarily");
}

function isFetchLikeError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("failed to fetch") || message.includes("fetch failed") || message.includes("networkerror");
}

function teacherAssignmentErrorMessage(error) {
  const message = cloudErrorMessage(error);
  if (isFetchLikeError(error)) return `${message}。请检查网络后刷新页面再试；系统已经自动重试过。`;
  return message;
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function loadStudentAssignments() {
  if (!isStudent()) return;
  const { data, error } = await state.supabase
    .from("assignments")
    .select("*")
    .eq("student_id", state.session.user.id)
    .order("created_at", { ascending: false });
  if (error) throw error;

  state.studentAssignments = data || [];
  await loadStudentProgressRows();
  renderStudentAssignments();

  if (!state.studentAssignments.length) {
    state.assignment = null;
    clearPracticeData();
    renderPractice();
    return;
  }

  const savedId = localStorage.getItem(selectedAssignmentKey());
  const nextAssignment =
    state.studentAssignments.find((assignment) => assignment.id === savedId) ||
    state.studentAssignments.find((assignment) => assignmentProgressPercent(assignment) < 100) ||
    state.studentAssignments[0];
  await selectStudentAssignment(nextAssignment.id);
}

async function loadStudentProgressRows() {
  const ids = state.studentAssignments.map((assignment) => assignment.id);
  if (!ids.length) {
    state.studentProgressRows = [];
    return;
  }
  const { data, error } = await state.supabase
    .from("segment_progress")
    .select("*")
    .in("assignment_id", ids)
    .order("segment_index", { ascending: true });
  if (error) throw error;
  state.studentProgressRows = data || [];
}

async function selectStudentAssignment(assignmentId) {
  const assignment = state.studentAssignments.find((item) => item.id === assignmentId);
  if (!assignment) return;

  clearPracticeData();
  state.assignment = assignment;
  state.lessonPath = assignment.lesson_path;
  localStorage.setItem(selectedAssignmentKey(), assignment.id);
  setSyncStatus("加载中", "");
  setAudioStatus("正在加载课包...");

  try {
    const rawLesson = await lessonRepository.load(assignment.lesson_path);
    state.lesson = normalizeLesson(rawLesson);
    state.lessonUrl = new URL(assignment.lesson_path, window.location.href).toString();
    if (state.lesson.audioSrc) {
      const audioUrl = new URL(state.lesson.audioSrc, state.lessonUrl).toString();
      prepareLessonAudio(audioUrl);
    } else {
      cancelAudioPreload();
      revokeCachedAudioUrl();
      state.audioSourceUrl = "";
      els.audio.removeAttribute("src");
      setAudioStatus("此课包没有关联音频");
    }
    applyLocalProgress();
    await loadCloudProgress();
    renderShell();
    saveLocalProgress();
  } catch (error) {
    setAudioStatus(`课包加载失败：${error.message}`);
    setSyncStatus(`课包加载失败：${error.message}`, "danger");
  }
}

async function loadCloudProgress() {
  if (!state.assignment) return;
  try {
    const [progressResult, rowsResult] = await Promise.all([
      state.supabase.from("assignment_progress").select("*").eq("assignment_id", state.assignment.id).maybeSingle(),
      state.supabase
        .from("segment_progress")
        .select("*")
        .eq("assignment_id", state.assignment.id)
        .order("segment_index", { ascending: true }),
    ]);
    if (progressResult.error) throw progressResult.error;
    if (rowsResult.error) throw rowsResult.error;

    const rows = rowsResult.data || [];
    const hasCloudData = Boolean(progressResult.data) || Boolean(rows.length);
    if (hasCloudData) {
      clearProgressOnly();
      applyCloudProgress(progressResult.data, rows);
      setSyncStatus("已恢复", "");
      saveLocalProgress();
    } else {
      setSyncStatus("正在创建云端进度", "warning");
      await saveCloudProgress(null, { statusText: "已保存" });
    }
  } catch (error) {
    reportCloudError("云端进度加载失败", error);
  }
}

function applyCloudProgress(progress, rows) {
  rows.forEach((row) => {
    state.answers[row.segment_id] = row.answer || "";
    state.submitted[row.segment_id] = Boolean(row.submitted);
    state.playedThrough[row.segment_id] = Boolean(row.heard_through);
    state.listenCounts[row.segment_id] = Number(row.listen_count || 0);
    if (row.score !== null && row.score !== undefined) state.scores[row.segment_id] = Number(row.score);
    if (row.submitted_at) state.submittedAt[row.segment_id] = row.submitted_at;
  });
  state.notes = progress?.notes || "";
  const savedIndex = Number.isInteger(progress?.current_segment_index) ? progress.current_segment_index : firstOpenIndex();
  state.unlockedIndex = computeUnlockedIndex();
  state.currentIndex = Math.max(0, Math.min(savedIndex, Math.max(0, state.lesson.segments.length - 1)));
  if (!canSelectSegment(state.currentIndex)) state.currentIndex = Math.min(state.unlockedIndex, state.lesson.segments.length - 1);
}

function renderShell() {
  const hasSession = Boolean(state.session);
  const loggedIn = Boolean(state.session && state.profile);
  const authPending = state.authLoading || (!state.authReady && state.configReady);
  const showLogin = !loggedIn && !hasSession && !authPending;
  els.authView.classList.toggle("is-hidden", !showLogin);
  els.appView.classList.toggle("is-hidden", !loggedIn);
  els.signOutButton.classList.toggle("is-hidden", !(loggedIn || hasSession));
  els.userBadge.classList.toggle("is-hidden", !(loggedIn || hasSession || authPending));

  if (!loggedIn) {
    if (hasSession && state.authError) {
      els.appStatus.textContent = state.authError;
      els.userBadge.textContent = "登录状态待恢复";
    } else if (hasSession || authPending) {
      els.appStatus.textContent = "正在恢复登录状态...";
      els.userBadge.textContent = "登录状态检查中";
    } else {
      els.appStatus.textContent = "登录后进入作业";
      delete document.body.dataset.role;
    }
    return;
  }

  const roleLabel = isTeacher() ? "老师" : "学生";
  const name = state.profile.full_name || state.profile.email || roleLabel;
  els.userBadge.textContent = `${name} · ${roleLabel}`;
  els.appStatus.textContent = isTeacher() ? "老师工作台" : "学生作业模式";
  document.body.dataset.role = state.profile.role;

  els.teacherPanel.classList.toggle("is-hidden", !isTeacher());
  els.studentTasksPanel.classList.toggle("is-hidden", !isStudent());
  els.practicePanel.classList.toggle("is-hidden", !isStudent());
  els.progressPanel.classList.toggle("is-hidden", !isStudent());

  if (isTeacher()) {
    renderTeacherDashboard();
  } else {
    renderStudentAssignments();
    renderPractice();
  }
}

function renderStudentAssignments() {
  if (!els.assignmentList) return;
  els.assignmentCount.textContent = `${state.studentAssignments.length} 个`;
  if (!state.studentAssignments.length) {
    els.assignmentList.innerHTML = '<div class="empty-state">还没有分配给你的任务</div>';
    return;
  }

  els.assignmentList.innerHTML = "";
  state.studentAssignments.forEach((assignment) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `assignment-row${state.assignment?.id === assignment.id ? " is-active" : ""}`;
    const progress = assignmentProgressPercent(assignment);
    button.innerHTML = `
      <strong>${escapeHtml(assignment.lesson_title)}</strong>
      <span class="assignment-meta">
        <span>${progress}% 完成</span>
        <span>${assignment.due_at ? `截止 ${escapeHtml(formatDateTime(assignment.due_at))}` : "无截止时间"}</span>
      </span>
    `;
    button.addEventListener("click", () => selectStudentAssignment(assignment.id));
    els.assignmentList.appendChild(button);
  });
}

function renderPractice() {
  const segment = currentSegment();
  const total = state.lesson.segments.length;
  const typeText = state.lesson.materialType === "conversation"
    ? " · 对话"
    : state.lesson.materialType === "announcement"
      ? " · 通知"
      : "";
  els.lessonMeta.textContent = state.assignment ? `${state.lesson.title}${typeText} · ${total} 句` : "请选择任务";
  els.segmentCounter.textContent = total ? `${state.currentIndex + 1} / ${total}` : "0 / 0";
  els.notesInput.value = state.notes;

  if (!segment) {
    els.timeRange.textContent = "--:-- - --:--";
    els.answerText.textContent = "暂无作业内容";
    els.dictationInput.value = "";
    els.dictationInput.readOnly = true;
    els.checkAnswer.disabled = true;
    els.copySegment.disabled = true;
    els.previousSegment.disabled = true;
    els.nextSegment.disabled = true;
    els.replaySegment.disabled = true;
    els.togglePlay.disabled = true;
    renderSpeakerBadge(null);
    updateSentenceStatus(null);
    updateScoreBadge(null);
    renderProgressSummary();
    drawWaveform();
    return;
  }

  els.timeRange.textContent = `${formatTime(segment.start)} - ${formatTime(segmentEnd(segment))}`;
  els.dictationInput.value = state.answers[segment.id] || "";
  els.dictationInput.readOnly = false;
  els.dictationInput.placeholder = isTranslationSegment(segment) ? "输入中文翻译" : "输入听到的内容";
  els.checkAnswer.textContent = isTranslationSegment(segment) ? "提交翻译" : "提交答案";
  els.checkAnswer.disabled = isSubmitted(segment);
  els.copySegment.disabled = !isSubmitted(segment);
  els.previousSegment.disabled = state.currentIndex <= 0;
  els.nextSegment.disabled = state.currentIndex >= total - 1;
  const nextIsGated = state.currentIndex < total - 1 && !canAdvanceFromCurrent();
  els.nextSegment.classList.toggle("is-gated", nextIsGated);
  els.nextSegment.title = nextGateMessage() || "下一句";
  const blockedByListenCap = !isSubmitted(segment) && getListenCount(segment) >= MAX_PRE_SUBMIT_LISTENS;
  els.replaySegment.disabled = !els.audio.src || blockedByListenCap;
  els.togglePlay.disabled = !els.audio.src || blockedByListenCap;

  renderSpeakerBadge(segment);
  renderAnswerText(segment);
  updateSentenceStatus(segment);
  updateListenCountBadge(segment);
  updateScoreBadge(segment);
  renderProgressSummary();
  drawWaveform();
}

function renderAnswerText(segment) {
  const shouldHide = !isSubmitted(segment);
  els.answerText.classList.toggle("is-hidden", shouldHide);
  if (shouldHide) {
    els.answerText.innerHTML = maskText(segmentAnswerText(segment));
  } else {
    els.answerText.textContent = segmentAnswerText(segment) || "暂无文本";
  }
}

function renderProgressSummary() {
  const total = state.lesson.segments.length;
  const submittedCount = state.lesson.segments.filter((segment) => isSubmitted(segment)).length;
  const heardCount = state.lesson.segments.filter((segment) => isPlayedThrough(segment)).length;
  const listenTotal = state.lesson.segments.reduce((sum, segment) => sum + getListenCount(segment), 0);
  const percent = total ? Math.round((submittedCount / total) * 100) : 0;
  els.progressText.textContent = `${percent}%`;
  els.progressSummary.innerHTML = `
    <div class="summary-item"><strong>${submittedCount}/${total}</strong><span class="muted">已提交</span></div>
    <div class="summary-item"><strong>${heardCount}/${total}</strong><span class="muted">已听完</span></div>
    <div class="summary-item"><strong>${listenTotal}</strong><span class="muted">累计听句次数</span></div>
    <div class="summary-item"><strong>${state.currentIndex + (total ? 1 : 0)}</strong><span class="muted">当前句</span></div>
  `;
}

function renderTeacherDashboard() {
  renderTeacherLessonOptions();
  renderMaterialSourceOptions();
  renderStudents();
  renderTeacherCompletionMatrix();
  renderTeacherAssignments();
  renderTeacherProgressDetails();
  if (els.teacherStatus) els.teacherStatus.textContent = `${state.students.length} 名学生 · ${state.teacherAssignments.length} 个任务`;
}

function renderSpeakerBadge(segment) {
  if (!els.speakerBadge) return;
  const label = segment ? segmentSpeakerLabel(segment, state.lesson) : "";
  const meaningful = Boolean(
    label
    && (
      state.lesson.materialType === "conversation"
      || state.lesson.materialType === "announcement"
      || !/^speaker$/i.test(label)
    )
  );
  els.speakerBadge.textContent = meaningful ? label : "";
  els.speakerBadge.classList.toggle("is-hidden", !meaningful);
}

function renderTeacherLessonOptions() {
  if (!els.teacherLessonSelect) return;
  els.teacherLessonSelect.innerHTML = "";
  if (!state.library.length) {
    els.teacherLessonSelect.innerHTML = '<option value="">未找到课包</option>';
    return;
  }
  state.library.forEach((lesson) => {
    const option = document.createElement("option");
    option.value = lesson.path;
    option.textContent = lesson.title || lesson.path;
    option.dataset.materialType = normalizeMaterialType(lesson.materialType || lesson.category);
    els.teacherLessonSelect.appendChild(option);
  });
}

function renderMaterialSourceOptions() {
  if (!els.materialSourceSelect) return;
  const selectedPath = els.materialSourceSelect.value;
  els.materialSourceSelect.innerHTML = "";
  if (!state.library.length) {
    els.materialSourceSelect.innerHTML = '<option value="">未找到课包</option>';
    return;
  }
  state.library.forEach((lesson) => {
    const option = document.createElement("option");
    option.value = lesson.path;
    option.textContent = lesson.title || lesson.path;
    option.dataset.materialType = normalizeMaterialType(lesson.materialType || lesson.category);
    els.materialSourceSelect.appendChild(option);
  });
  if (state.library.some((lesson) => lesson.path === selectedPath)) {
    els.materialSourceSelect.value = selectedPath;
  }
}

async function loadSelectedMaterialForEditor() {
  const path = els.materialSourceSelect?.value || "";
  if (!path) {
    setMaterialEditorStatus("请选择课包", "warning");
    return;
  }

  const existingIndex = state.materialEditor.drafts.findIndex((draft) => draft.sourcePath === path);
  if (existingIndex >= 0) {
    state.materialEditor.activeIndex = existingIndex;
    renderMaterialEditor();
    setMaterialEditorStatus("已切换到现有草稿");
    return;
  }

  if (els.loadMaterialButton) els.loadMaterialButton.disabled = true;
  setMaterialEditorStatus("正在载入...");
  try {
    const rawLesson = await lessonRepository.load(path);
    const libraryItem = state.library.find((lesson) => lesson.path === path);
    addMaterialEditorDraft(rawLesson, {
      sourcePath: path,
      fileName: path.split("/").at(-1) || "material.json",
      originLabel: libraryItem?.title || path,
    });
    setMaterialEditorStatus("课包已载入");
  } catch (error) {
    console.error("Material editor load failed", error);
    setMaterialEditorStatus(`载入失败：${error.message || String(error)}`, "danger");
  } finally {
    if (els.loadMaterialButton) els.loadMaterialButton.disabled = false;
  }
}

function createDialogueMaterialDraft() {
  const now = Date.now();
  addMaterialEditorDraft(
    {
      schemaVersion: 2,
      id: `conversation-draft-${now}`,
      title: "未命名对话",
      category: "对话",
      materialType: "conversation",
      source: "",
      language: "en",
      audioSrc: "",
      speakers: [
        { id: "narrator", label: "旁白", role: "narrator" },
        { id: "speaker-a", label: "角色 A", role: "" },
        { id: "speaker-b", label: "角色 B", role: "" },
      ],
      workflow: {
        status: "draft",
        editable: true,
        reviewRequired: true,
      },
      segments: [],
    },
    {
      fileName: `conversation-draft-${now}.json`,
      originLabel: "新建对话",
      dirty: true,
    }
  );
  setMaterialEditorStatus("已新建对话草稿", "warning");
}

async function importMaterialFiles(event) {
  const files = Array.from(event.target?.files || []);
  if (!files.length) return;
  let importedCount = 0;
  const errors = [];

  for (const file of files) {
    try {
      const parsed = JSON.parse(await file.text());
      const materials = Array.isArray(parsed?.materials)
        ? parsed.materials
        : Array.isArray(parsed)
          ? parsed
          : [parsed];
      materials.forEach((material, index) => {
        addMaterialEditorDraft(
          material,
          {
            fileName: materials.length > 1 ? `${file.name.replace(/\.json$/i, "")}-${index + 1}.json` : file.name,
            originLabel: file.name,
          },
          false
        );
        importedCount += 1;
      });
    } catch (error) {
      console.error("Material import failed", file.name, error);
      errors.push(`${file.name}: ${error.message || String(error)}`);
    }
  }

  event.target.value = "";
  renderMaterialEditor();
  if (errors.length) {
    setMaterialEditorStatus(`已导入 ${importedCount} 篇；${errors.join("；")}`, "danger");
  } else {
    setMaterialEditorStatus(`已导入 ${importedCount} 篇材料`);
  }
}

function addMaterialEditorDraft(rawMaterial, meta = {}, shouldRender = true) {
  const data = normalizeMaterialDraft(rawMaterial);
  state.materialEditor.drafts.push({
    data,
    sourcePath: meta.sourcePath || "",
    fileName: meta.fileName || `${data.id || materialSlug(data.title) || "material"}.json`,
    originLabel: meta.originLabel || data.title,
    dirty: Boolean(meta.dirty),
  });
  state.materialEditor.activeIndex = state.materialEditor.drafts.length - 1;
  if (shouldRender) renderMaterialEditor();
}

function normalizeMaterialDraft(rawMaterial) {
  const draft = deepClone(rawMaterial && typeof rawMaterial === "object" ? rawMaterial : {});
  const rawSegments = Array.isArray(draft.segments) ? draft.segments : [];
  draft.schemaVersion = Math.max(2, Number(draft.schemaVersion || 1));
  draft.id = String(draft.id || materialSlug(draft.title) || `material-${Date.now()}`);
  draft.title = String(draft.title || "未命名材料");
  draft.materialType = normalizeMaterialType(
    draft.materialType
    || draft.contentType
    || draft.unitType
    || draft.source?.unitType
    || draft.category
  );
  draft.category = String(draft.category || materialTypeLabel(draft.materialType));
  draft.language = String(draft.language || "en");
  draft.audioSrc = String(draft.audioSrc || draft.audio || "");
  draft.speakers = normalizeSpeakers(draft.speakers, rawSegments);

  if (!draft.speakers.length) {
    draft.speakers = draft.materialType === "conversation"
      ? [
        { id: "speaker-a", label: "角色 A", role: "" },
        { id: "speaker-b", label: "角色 B", role: "" },
      ]
      : [{ id: "speaker", label: "Speaker", role: "" }];
  }

  draft.segments = rawSegments.map((rawSegment, index) => {
    const segment = rawSegment && typeof rawSegment === "object" ? deepClone(rawSegment) : {};
    const rawSpeaker = String(segment.speaker || segment.speakerLabel || "").trim();
    const speakerId = String(
      segment.speakerId
      || findSpeakerId(draft.speakers, rawSpeaker)
      || draft.speakers[0]?.id
      || ""
    );
    const speaker = draft.speakers.find((item) => item.id === speakerId);
    segment.id = String(segment.id || `s${String(index + 1).padStart(3, "0")}`);
    segment.start = toNumberOrNull(segment.start);
    segment.end = toNumberOrNull(segment.end);
    segment.speakerId = speakerId;
    segment.speaker = String(speaker?.label || rawSpeaker || speakerId);
    segment.turnId = String(segment.turnId || segment.turn || `t${String(index + 1).padStart(3, "0")}`);
    segment.text = String(segment.text || segment.transcript || "").trim();
    return segment;
  });
  draft.workflow = draft.workflow && typeof draft.workflow === "object"
    ? draft.workflow
    : { status: "draft", editable: true, reviewRequired: true };
  return draft;
}

function renderMaterialEditor() {
  renderMaterialBatchOptions();
  const draft = activeMaterialDraft();
  if (!draft) {
    els.materialEditorEmpty?.classList.remove("is-hidden");
    els.materialEditorForm?.classList.add("is-hidden");
    setMaterialEditorStatus("尚未载入");
    return;
  }

  els.materialEditorEmpty?.classList.add("is-hidden");
  els.materialEditorForm?.classList.remove("is-hidden");
  els.materialTypeInput.value = draft.data.materialType;
  els.materialTitleInput.value = draft.data.title;
  els.materialSourceInput.value = materialSourceText(draft.data.source);
  els.materialAudioInput.value = draft.data.audioSrc;
  renderMaterialSpeakers();
  renderMaterialSegments();
  refreshMaterialEditorStatus();
}

function renderMaterialBatchOptions() {
  if (!els.materialBatchSelect) return;
  els.materialBatchSelect.innerHTML = "";
  if (!state.materialEditor.drafts.length) {
    els.materialBatchSelect.innerHTML = '<option value="">无草稿</option>';
    els.materialBatchSelect.disabled = true;
    return;
  }
  els.materialBatchSelect.disabled = false;
  state.materialEditor.drafts.forEach((draft, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `${draft.data.title || draft.originLabel || `材料 ${index + 1}`}${draft.dirty ? " *" : ""}`;
    els.materialBatchSelect.appendChild(option);
  });
  if (state.materialEditor.activeIndex < 0 || state.materialEditor.activeIndex >= state.materialEditor.drafts.length) {
    state.materialEditor.activeIndex = 0;
  }
  els.materialBatchSelect.value = String(state.materialEditor.activeIndex);
}

function renderMaterialSpeakers() {
  const draft = activeMaterialDraft();
  if (!draft || !els.materialSpeakers) return;
  els.materialSpeakers.innerHTML = draft.data.speakers.map((speaker, index) => `
    <div class="material-speaker-row" data-speaker-index="${index}">
      <span class="material-row-index">${index + 1}</span>
      <label>
        角色 ID
        <input type="text" data-field="id" value="${escapeHtml(speaker.id)}" />
      </label>
      <label>
        显示名称
        <input type="text" data-field="label" value="${escapeHtml(speaker.label)}" />
      </label>
      <label>
        角色说明
        <input type="text" data-field="role" value="${escapeHtml(speaker.role)}" />
      </label>
      <button class="icon-button compact-icon-button" type="button" data-action="remove-speaker" title="删除角色" aria-label="删除角色">×</button>
    </div>
  `).join("");
}

function renderMaterialSegments() {
  const draft = activeMaterialDraft();
  if (!draft || !els.materialSegments) return;
  if (!draft.data.segments.length) {
    els.materialSegments.innerHTML = '<div class="empty-state">还没有句子</div>';
    return;
  }

  const speakerOptions = draft.data.speakers.map((speaker) => (
    `<option value="${escapeHtml(speaker.id)}">${escapeHtml(speaker.label)}</option>`
  )).join("");

  els.materialSegments.innerHTML = draft.data.segments.map((segment, index) => `
    <div class="material-segment-row" data-segment-index="${index}">
      <div class="material-segment-order">
        <strong>${index + 1}</strong>
        <input type="text" data-field="id" value="${escapeHtml(segment.id)}" aria-label="句子 ID" />
      </div>
      <label>
        角色
        <select data-field="speakerId">${speakerOptions}</select>
      </label>
      <label>
        轮次
        <input type="text" data-field="turnId" value="${escapeHtml(segment.turnId)}" />
      </label>
      <label>
        开始
        <input type="number" data-field="start" min="0" step="0.01" value="${segment.start ?? ""}" />
      </label>
      <label>
        结束
        <input type="number" data-field="end" min="0" step="0.01" value="${segment.end ?? ""}" />
      </label>
      <label class="material-segment-text">
        文本
        <textarea rows="2" data-field="text">${escapeHtml(segment.text)}</textarea>
      </label>
      <div class="material-segment-actions">
        <button class="icon-button compact-icon-button" type="button" data-action="move-up" title="上移" aria-label="上移" ${index === 0 ? "disabled" : ""}>↑</button>
        <button class="icon-button compact-icon-button" type="button" data-action="move-down" title="下移" aria-label="下移" ${index === draft.data.segments.length - 1 ? "disabled" : ""}>↓</button>
        <button class="icon-button compact-icon-button" type="button" data-action="remove-segment" title="删除句子" aria-label="删除句子">×</button>
      </div>
    </div>
  `).join("");

  draft.data.segments.forEach((segment, index) => {
    const select = els.materialSegments.querySelector(`[data-segment-index="${index}"] select[data-field="speakerId"]`);
    if (select) select.value = segment.speakerId;
  });
}

function updateMaterialMeta(event) {
  const draft = activeMaterialDraft();
  if (!draft) return;
  const target = event?.target;
  if (target === els.materialTypeInput) {
    draft.data.materialType = normalizeMaterialType(target.value);
    if (!draft.data.category || ["讲座", "对话", "通知", "其他"].includes(draft.data.category)) {
      draft.data.category = materialTypeLabel(draft.data.materialType);
    }
  } else if (target === els.materialTitleInput) {
    draft.data.title = target.value;
  } else if (target === els.materialSourceInput) {
    draft.data.source = parseMaterialSourceValue(target.value, draft.data.source);
  } else if (target === els.materialAudioInput) {
    draft.data.audioSrc = target.value;
  }
  markMaterialDraftDirty();
}

function removeCurrentMaterialDraft() {
  const index = state.materialEditor.activeIndex;
  if (index < 0 || index >= state.materialEditor.drafts.length) return;
  state.materialEditor.drafts.splice(index, 1);
  state.materialEditor.activeIndex = Math.min(index, state.materialEditor.drafts.length - 1);
  renderMaterialEditor();
  setMaterialEditorStatus(state.materialEditor.drafts.length ? "已移除当前草稿" : "尚未载入");
}

function updateMaterialSpeaker(event) {
  const draft = activeMaterialDraft();
  const row = event.target.closest?.("[data-speaker-index]");
  const field = event.target.dataset?.field;
  if (!draft || !row || !field) return;
  const index = Number(row.dataset.speakerIndex);
  const speaker = draft.data.speakers[index];
  if (!speaker) return;

  const oldId = speaker.id;
  speaker[field] = event.target.value;
  if (field === "id") {
    draft.data.segments.forEach((segment) => {
      if (segment.speakerId === oldId) segment.speakerId = speaker.id;
    });
  }
  if (field === "label") {
    draft.data.segments.forEach((segment) => {
      if (segment.speakerId === speaker.id) segment.speaker = speaker.label;
    });
  }
  if (field === "id" || field === "label") renderMaterialSegments();
  markMaterialDraftDirty();
}

function handleMaterialSpeakerAction(event) {
  const button = event.target.closest?.("button[data-action]");
  if (!button || button.dataset.action !== "remove-speaker") return;
  const draft = activeMaterialDraft();
  const row = button.closest("[data-speaker-index]");
  if (!draft || !row) return;
  const index = Number(row.dataset.speakerIndex);
  const removed = draft.data.speakers[index];
  if (!removed) return;

  draft.data.speakers.splice(index, 1);
  if (!draft.data.speakers.length) {
    draft.data.speakers.push({ id: "speaker", label: "Speaker", role: "" });
  }
  const fallback = draft.data.speakers[0];
  draft.data.segments.forEach((segment) => {
    if (segment.speakerId === removed.id) {
      segment.speakerId = fallback.id;
      segment.speaker = fallback.label;
    }
  });
  markMaterialDraftDirty();
  renderMaterialSpeakers();
  renderMaterialSegments();
}

function addMaterialSpeaker() {
  const draft = activeMaterialDraft();
  if (!draft) return;
  const id = nextUniqueSpeakerId(draft.data.speakers);
  draft.data.speakers.push({
    id,
    label: `角色 ${draft.data.speakers.length + 1}`,
    role: "",
  });
  markMaterialDraftDirty();
  renderMaterialSpeakers();
  renderMaterialSegments();
}

function updateMaterialSegment(event) {
  const draft = activeMaterialDraft();
  const row = event.target.closest?.("[data-segment-index]");
  const field = event.target.dataset?.field;
  if (!draft || !row || !field) return;
  const segment = draft.data.segments[Number(row.dataset.segmentIndex)];
  if (!segment) return;

  if (field === "start" || field === "end") {
    segment[field] = event.target.value === "" ? null : Number(event.target.value);
  } else {
    segment[field] = event.target.value;
  }
  if (field === "speakerId") {
    const speaker = draft.data.speakers.find((item) => item.id === segment.speakerId);
    segment.speaker = speaker?.label || segment.speakerId;
  }
  markMaterialDraftDirty();
}

function handleMaterialSegmentAction(event) {
  const button = event.target.closest?.("button[data-action]");
  if (!button) return;
  const draft = activeMaterialDraft();
  const row = button.closest("[data-segment-index]");
  if (!draft || !row) return;
  const index = Number(row.dataset.segmentIndex);
  const action = button.dataset.action;

  if (action === "remove-segment") {
    draft.data.segments.splice(index, 1);
  } else if (action === "move-up" && index > 0) {
    [draft.data.segments[index - 1], draft.data.segments[index]] = [
      draft.data.segments[index],
      draft.data.segments[index - 1],
    ];
  } else if (action === "move-down" && index < draft.data.segments.length - 1) {
    [draft.data.segments[index + 1], draft.data.segments[index]] = [
      draft.data.segments[index],
      draft.data.segments[index + 1],
    ];
  } else {
    return;
  }
  markMaterialDraftDirty();
  renderMaterialSegments();
}

function addMaterialSegment() {
  const draft = activeMaterialDraft();
  if (!draft) return;
  const previous = draft.data.segments.at(-1);
  const start = isFiniteNumber(previous?.end) ? Number(previous.end) : 0;
  const index = draft.data.segments.length + 1;
  const speaker = draft.data.speakers[0] || { id: "speaker", label: "Speaker" };
  draft.data.segments.push({
    id: nextUniqueSegmentId(draft.data.segments),
    start,
    end: Number((start + 1).toFixed(2)),
    speakerId: speaker.id,
    speaker: speaker.label,
    turnId: `t${String(index).padStart(3, "0")}`,
    text: "",
  });
  markMaterialDraftDirty();
  renderMaterialSegments();
}

function markMaterialDraftDirty() {
  const draft = activeMaterialDraft();
  if (!draft) return;
  draft.dirty = true;
  renderMaterialBatchOptions();
  refreshMaterialEditorStatus();
}

function refreshMaterialEditorStatus() {
  const draft = activeMaterialDraft();
  if (!draft) {
    setMaterialEditorStatus("尚未载入");
    return;
  }
  const issues = validateMaterialDraft(draft.data);
  const status = `${draft.data.segments.length} 句 · ${draft.data.speakers.length} 角色 · ${draft.dirty ? "已修改" : "未修改"}`;
  setMaterialEditorStatus(issues.length ? `${status} · ${issues.length} 项待修正` : `${status} · 可导出`, issues.length ? "warning" : "");
}

function validateMaterialDraft(data) {
  const issues = [];
  if (!String(data.id || "").trim()) issues.push("缺少材料 ID");
  if (!String(data.title || "").trim()) issues.push("缺少标题");
  if (!String(data.audioSrc || "").trim()) issues.push("缺少音频路径");
  if (!Array.isArray(data.segments) || !data.segments.length) issues.push("没有句子");

  const speakerIds = (data.speakers || []).map((speaker) => String(speaker.id || "").trim());
  const speakerLabels = (data.speakers || []).map((speaker) => String(speaker.label || "").trim());
  if (speakerIds.some((id) => !id)) issues.push("角色 ID 不能为空");
  if (speakerLabels.some((label) => !label)) issues.push("角色名称不能为空");
  if (new Set(speakerIds).size !== speakerIds.length) issues.push("角色 ID 重复");

  const segmentIds = (data.segments || []).map((segment) => String(segment.id || "").trim());
  if (segmentIds.some((id) => !id)) issues.push("句子 ID 不能为空");
  if (new Set(segmentIds).size !== segmentIds.length) issues.push("句子 ID 重复");

  (data.segments || []).forEach((segment, index) => {
    if (!String(segment.text || "").trim()) issues.push(`第 ${index + 1} 句缺少文本`);
    if (!isFiniteNumber(segment.start) || !isFiniteNumber(segment.end) || Number(segment.end) <= Number(segment.start)) {
      issues.push(`第 ${index + 1} 句时间无效`);
    }
    if (data.materialType === "conversation" && !speakerIds.includes(String(segment.speakerId || ""))) {
      issues.push(`第 ${index + 1} 句角色无效`);
    }
    if (data.materialType === "conversation" && !String(segment.turnId || "").trim()) {
      issues.push(`第 ${index + 1} 句缺少轮次`);
    }
  });
  return issues;
}

function exportCurrentMaterial() {
  const draft = activeMaterialDraft();
  if (!draft) {
    setMaterialEditorStatus("没有可导出的材料", "warning");
    return;
  }
  const issues = validateMaterialDraft(draft.data);
  if (issues.length) {
    setMaterialEditorStatus(`无法导出：${issues.join("；")}`, "danger");
    return;
  }
  const material = cleanMaterialForExport(draft.data);
  downloadJson(material, safeMaterialFileName(draft.fileName, material));
  draft.dirty = false;
  renderMaterialEditor();
  setMaterialEditorStatus("当前材料已导出");
}

function exportMaterialBatch() {
  if (!state.materialEditor.drafts.length) {
    setMaterialEditorStatus("没有可导出的材料", "warning");
    return;
  }
  const invalid = state.materialEditor.drafts
    .map((draft, index) => ({ index, issues: validateMaterialDraft(draft.data) }))
    .filter((item) => item.issues.length);
  if (invalid.length) {
    setMaterialEditorStatus(`批量导出前请修正第 ${invalid.map((item) => item.index + 1).join("、")} 篇`, "danger");
    return;
  }
  const payload = {
    schemaVersion: 1,
    exportType: "listening-lms-material-batch",
    exportedAt: new Date().toISOString(),
    materials: state.materialEditor.drafts.map((draft) => cleanMaterialForExport(draft.data)),
  };
  downloadJson(payload, `listening-materials-batch-${new Date().toISOString().slice(0, 10)}.json`);
  state.materialEditor.drafts.forEach((draft) => {
    draft.dirty = false;
  });
  renderMaterialEditor();
  setMaterialEditorStatus(`已导出 ${payload.materials.length} 篇材料`);
}

function cleanMaterialForExport(data) {
  const material = deepClone(data);
  material.schemaVersion = Math.max(2, Number(material.schemaVersion || 1));
  material.materialType = normalizeMaterialType(material.materialType);
  material.speakers = (material.speakers || []).map((speaker) => ({
    ...speaker,
    id: String(speaker.id || "").trim(),
    label: String(speaker.label || speaker.name || speaker.id || "").trim(),
    role: String(speaker.role || "").trim(),
  }));
  material.segments = (material.segments || []).map((segment, index) => {
    const speaker = material.speakers.find((item) => item.id === segment.speakerId);
    return {
      ...segment,
      id: String(segment.id || `s${String(index + 1).padStart(3, "0")}`),
      start: Number(segment.start),
      end: Number(segment.end),
      speakerId: String(segment.speakerId || speaker?.id || ""),
      speaker: String(speaker?.label || segment.speaker || segment.speakerId || ""),
      turnId: String(segment.turnId || segment.turn || `t${String(index + 1).padStart(3, "0")}`),
      text: String(segment.text || "").trim(),
    };
  });
  material.workflow = {
    status: "draft",
    editable: true,
    reviewRequired: true,
    ...(material.workflow || {}),
  };
  return material;
}

function setMaterialEditorStatus(text, tone = "") {
  if (!els.materialEditorStatus) return;
  els.materialEditorStatus.textContent = text;
  els.materialEditorStatus.classList.toggle("is-warning", tone === "warning");
  els.materialEditorStatus.classList.toggle("is-danger", tone === "danger");
}

function activeMaterialDraft() {
  return state.materialEditor.drafts[state.materialEditor.activeIndex] || null;
}

function materialSourceText(source) {
  if (typeof source === "string") return source;
  if (!source) return "";
  try {
    return JSON.stringify(source);
  } catch (error) {
    return String(source);
  }
}

function parseMaterialSourceValue(value, previousValue) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (!previousValue || typeof previousValue !== "object") return value;
  try {
    return JSON.parse(text);
  } catch (error) {
    return value;
  }
}

function materialTypeLabel(type) {
  if (type === "conversation") return "对话";
  if (type === "announcement") return "通知";
  if (type === "other") return "其他";
  return "讲座";
}

function nextUniqueSpeakerId(speakers) {
  const existing = new Set(speakers.map((speaker) => speaker.id));
  let index = speakers.length + 1;
  while (existing.has(`speaker-${index}`)) index += 1;
  return `speaker-${index}`;
}

function nextUniqueSegmentId(segments) {
  const existing = new Set(segments.map((segment) => segment.id));
  let index = segments.length + 1;
  let id = `s${String(index).padStart(3, "0")}`;
  while (existing.has(id)) {
    index += 1;
    id = `s${String(index).padStart(3, "0")}`;
  }
  return id;
}

function safeMaterialFileName(fileName, material) {
  const sourceName = String(fileName || "").replace(/\.json$/i, "");
  const base = materialSlug(sourceName) || materialSlug(material.id) || materialSlug(material.title) || "material";
  return `${base}.json`;
}

function materialSlug(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function downloadJson(value, fileName) {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function renderStudents() {
  if (!els.studentSelect || !els.studentsList) return;
  els.studentSelect.innerHTML = "";
  if (!state.students.length) {
    els.studentSelect.innerHTML = '<option value="">暂无学生</option>';
    els.studentsList.innerHTML = '<div class="empty-state">学生注册后会出现在这里</div>';
    return;
  }

  els.studentsList.innerHTML = "";
  state.students.forEach((student) => {
    const option = document.createElement("option");
    option.value = student.id;
    option.textContent = student.full_name || student.email || student.id;
    els.studentSelect.appendChild(option);

    const row = document.createElement("div");
    row.className = "compact-person";
    row.innerHTML = `<strong>${escapeHtml(student.full_name || "未命名")}</strong><span class="muted">${escapeHtml(student.email || "")}</span>`;
    els.studentsList.appendChild(row);
  });
}

function renderTeacherAssignments() {
  if (!els.teacherAssignments) return;
  if (!state.teacherAssignments.length) {
    els.teacherAssignments.innerHTML = '<div class="empty-state">还没有分配任务</div>';
    return;
  }

  const studentById = new Map(state.students.map((student) => [student.id, student]));
  const rowsByAssignment = groupProgressByAssignment(state.teacherProgressRows);
  const progressByAssignment = groupAssignmentProgressByAssignment();
  const rows = state.teacherAssignments
    .map((assignment) => {
      const metrics = teacherAssignmentMetrics(assignment, rowsByAssignment, progressByAssignment);
      const student = studentById.get(assignment.student_id);
      const active = state.selectedTeacherAssignmentId === assignment.id;
      return `
        <tr>
          <td><button class="ghost-button small-button" data-view-assignment="${assignment.id}" type="button">${active ? "查看中" : "查看"}</button></td>
          <td>${escapeHtml(student?.full_name || student?.email || "未知学生")}</td>
          <td>${escapeHtml(assignment.lesson_title)}</td>
          <td><span class="progress-status ${metrics.className}">${metrics.label}</span></td>
          <td>${metrics.completion}% (${metrics.submittedCount}/${metrics.total})</td>
          <td>${metrics.listenTotal}</td>
          <td>${metrics.avgScore}</td>
          <td>${metrics.latest ? escapeHtml(formatDateTime(metrics.latest)) : "--"}</td>
        </tr>
      `;
    })
    .join("");

  els.teacherAssignments.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>明细</th>
          <th>学生</th>
          <th>任务</th>
          <th>状态</th>
          <th>完成率</th>
          <th>听了几次</th>
          <th>平均分</th>
          <th>最近提交</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
  bindTeacherAssignmentViewButtons(els.teacherAssignments);
}

function renderTeacherCompletionMatrix() {
  if (!els.teacherCompletionMatrix) return;
  if (!state.students.length) {
    els.teacherCompletionMatrix.innerHTML = '<div class="empty-state">暂无学生</div>';
    return;
  }

  const lessons = teacherAssignedLessons();
  if (!lessons.length) {
    els.teacherCompletionMatrix.innerHTML = '<div class="empty-state">还没有可统计的课包</div>';
    return;
  }

  const rowsByAssignment = groupProgressByAssignment(state.teacherProgressRows);
  const progressByAssignment = groupAssignmentProgressByAssignment();
  const assignmentsByStudentLesson = groupAssignmentsByStudentLesson();
  const stats = teacherCompletionStats(lessons, assignmentsByStudentLesson, rowsByAssignment, progressByAssignment);
  const headerCells = lessons
    .map((lesson) => {
      const displayTitle = lesson.displayTitle || lesson.title;
      const fullTitle = lesson.path && lesson.path !== lesson.title ? `${displayTitle} (${lesson.path})` : displayTitle;
      return `<th title="${escapeHtml(fullTitle)}">${escapeHtml(shortLessonTitle(displayTitle))}</th>`;
    })
    .join("");
  const bodyRows = state.students
    .map((student) => {
      const cells = lessons
        .map((lesson) => {
          const key = studentLessonKey(student.id, lesson.path);
          const assignments = assignmentsByStudentLesson.get(key) || [];
          if (!assignments.length) {
            return '<td class="matrix-cell is-unassigned"><span>未布置</span></td>';
          }
          const assignment = latestAssignment(assignments);
          const metrics = teacherAssignmentMetrics(assignment, rowsByAssignment, progressByAssignment);
          const duplicateText = assignments.length > 1 ? `<span>${assignments.length} 次布置</span>` : "";
          const dueText = assignment.due_at && !metrics.completed ? `<span>截止 ${escapeHtml(formatDateTime(assignment.due_at))}</span>` : "";
          return `
            <td class="matrix-cell ${metrics.className}">
              <button type="button" data-view-assignment="${assignment.id}">
                <strong>${metrics.label}</strong>
                <span>${metrics.submittedCount}/${metrics.total} · ${metrics.completion}%</span>
                ${metrics.latest ? `<span>最近 ${escapeHtml(formatDateTime(metrics.latest))}</span>` : dueText}
                ${duplicateText}
              </button>
            </td>
          `;
        })
        .join("");
      return `
        <tr>
          <th class="student-axis">${escapeHtml(student.full_name || student.email || "未命名")}</th>
          ${cells}
        </tr>
      `;
    })
    .join("");

  els.teacherCompletionMatrix.innerHTML = `
    <div class="completion-summary">
      <span><strong>${stats.completed}</strong> 已完成</span>
      <span><strong>${stats.inProgress}</strong> 进行中</span>
      <span><strong>${stats.notStarted}</strong> 未开始</span>
      <span><strong>${stats.overdue}</strong> 已逾期</span>
      <span><strong>${stats.unassigned}</strong> 未布置</span>
    </div>
    <table class="teacher-completion-table">
      <thead>
        <tr>
          <th class="student-axis">学生</th>
          ${headerCells}
        </tr>
      </thead>
      <tbody>${bodyRows}</tbody>
    </table>
  `;
  bindTeacherAssignmentViewButtons(els.teacherCompletionMatrix);
}

function bindTeacherAssignmentViewButtons(root) {
  root.querySelectorAll("[data-view-assignment]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.selectedTeacherAssignmentId = button.dataset.viewAssignment;
      renderTeacherDashboard();
      await ensureTeacherSelectedLessonLoaded();
      renderTeacherDashboard();
    });
  });
}

function teacherAssignedLessons() {
  const byPath = new Map();
  state.library.forEach((lesson) => {
    const path = lesson.path || lesson.id || lesson.title;
    if (!path || byPath.has(path)) return;
    byPath.set(path, {
      path,
      title: lesson.title || path,
    });
  });
  state.teacherAssignments.forEach((assignment) => {
    const path = assignment.lesson_path || assignment.content_ref?.path || assignment.lesson_title;
    if (!path || byPath.has(path)) return;
    byPath.set(path, {
      path,
      title: assignment.lesson_title || path,
    });
  });
  const lessons = [...byPath.values()].sort((a, b) => a.title.localeCompare(b.title, "zh-CN") || a.path.localeCompare(b.path, "zh-CN"));
  const titleCounts = lessons.reduce((counts, lesson) => counts.set(lesson.title, (counts.get(lesson.title) || 0) + 1), new Map());
  const titleIndexes = new Map();
  return lessons.map((lesson) => {
    const count = titleCounts.get(lesson.title) || 0;
    if (count <= 1) return { ...lesson, displayTitle: lesson.title };
    const index = (titleIndexes.get(lesson.title) || 0) + 1;
    titleIndexes.set(lesson.title, index);
    return { ...lesson, displayTitle: `${lesson.title} (${index})` };
  });
}

function groupAssignmentsByStudentLesson() {
  const grouped = new Map();
  state.teacherAssignments.forEach((assignment) => {
    const key = studentLessonKey(assignment.student_id, assignment.lesson_path || assignment.content_ref?.path || assignment.lesson_title);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(assignment);
  });
  return grouped;
}

function studentLessonKey(studentId, lessonPath) {
  return `${studentId || ""}::${lessonPath || ""}`;
}

function latestAssignment(assignments) {
  return [...assignments].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))[0];
}

function groupAssignmentProgressByAssignment() {
  return new Map(state.teacherAssignmentProgressRows.map((row) => [row.assignment_id, row]));
}

function teacherAssignmentMetrics(assignment, rowsByAssignment, progressByAssignment) {
  const progressRows = rowsByAssignment.get(assignment.id) || [];
  const assignmentProgress = progressByAssignment.get(assignment.id) || null;
  const submittedCount = progressRows.filter((row) => row.submitted).length;
  const total = Number(assignment.lesson_segment_count || 0);
  const listenTotal = progressRows.reduce((sum, row) => sum + Number(row.listen_count || 0), 0);
  const scored = progressRows.filter((row) => row.submitted && row.score !== null && row.score !== undefined);
  const avgScore = scored.length ? Math.round(scored.reduce((sum, row) => sum + Number(row.score || 0), 0) / scored.length) : "--";
  const latest = latestSubmittedAt(progressRows) || assignmentProgress?.completed_at || assignmentProgress?.updated_at || "";
  const completed = Boolean(assignmentProgress?.completed) || (total > 0 && submittedCount >= total);
  const completion = total ? Math.round((submittedCount / total) * 100) : completed ? 100 : 0;
  const started = Boolean(assignmentProgress) || progressRows.length > 0;
  const overdue = !completed && assignment.due_at && new Date(assignment.due_at).getTime() < Date.now();
  let label = "进行中";
  let className = "is-in-progress";
  if (completed) {
    label = "已完成";
    className = "is-complete";
  } else if (overdue) {
    label = "已逾期";
    className = "is-overdue";
  } else if (!started) {
    label = "未开始";
    className = "is-not-started";
  }
  return {
    submittedCount,
    total,
    listenTotal,
    avgScore,
    latest,
    completed,
    completion,
    started,
    overdue,
    label,
    className,
  };
}

function teacherCompletionStats(lessons, assignmentsByStudentLesson, rowsByAssignment, progressByAssignment) {
  const stats = { completed: 0, inProgress: 0, notStarted: 0, overdue: 0, unassigned: 0 };
  state.students.forEach((student) => {
    lessons.forEach((lesson) => {
      const assignments = assignmentsByStudentLesson.get(studentLessonKey(student.id, lesson.path)) || [];
      if (!assignments.length) {
        stats.unassigned += 1;
        return;
      }
      const metrics = teacherAssignmentMetrics(latestAssignment(assignments), rowsByAssignment, progressByAssignment);
      if (metrics.completed) stats.completed += 1;
      else if (metrics.overdue) stats.overdue += 1;
      else if (metrics.started) stats.inProgress += 1;
      else stats.notStarted += 1;
    });
  });
  return stats;
}

function shortLessonTitle(title) {
  const value = String(title || "");
  return value.length > 18 ? `${value.slice(0, 17)}…` : value;
}

function renderTeacherProgressDetails() {
  if (!els.teacherProgress) return;
  const assignment = state.teacherAssignments.find((item) => item.id === state.selectedTeacherAssignmentId);
  if (!assignment) {
    els.teacherProgress.innerHTML = '<div class="empty-state">选择一个任务查看句子明细</div>';
    return;
  }

  const rows = state.teacherProgressRows
    .filter((row) => row.assignment_id === assignment.id)
    .sort((a, b) => Number(a.segment_index || 0) - Number(b.segment_index || 0));
  const detail = state.teacherLessonDetails[assignment.lesson_path];
  if (!detail) {
    els.teacherProgress.innerHTML = '<div class="empty-state">正在加载题目明细...</div>';
    return;
  }
  if (detail.error) {
    els.teacherProgress.innerHTML = `<div class="empty-state">题目加载失败：${escapeHtml(detail.error)}</div>`;
    return;
  }
  const segments = detail.lesson?.segments || [];
  const rowsBySegmentId = new Map(rows.map((row) => [row.segment_id, row]));
  const rowsByIndex = new Map(rows.map((row) => [Number(row.segment_index || 0), row]));
  const detailRows = segments.map((segment, index) => {
    const row = rowsBySegmentId.get(segment.id) || rowsByIndex.get(index) || {};
    return `
      <tr>
        <td>${index + 1}</td>
        <td>${isTranslationSegment(segment) ? "听翻" : "听抄"}</td>
        <td>${escapeHtml(segmentSpeakerLabel(segment, detail.lesson) || "--")}</td>
        <td class="question-cell">${escapeHtml(segment.text || "")}</td>
        <td class="question-cell">${escapeHtml(segmentAnswerText(segment) || "")}</td>
        <td class="answer-cell">${escapeHtml(row.answer || "")}</td>
        <td>${Number(row.listen_count || 0)}</td>
        <td>${row.submitted ? "已提交" : "未提交"}</td>
        <td>${row.score ?? "--"}</td>
        <td>${row.submitted_at ? escapeHtml(formatDateTime(row.submitted_at)) : "--"}</td>
      </tr>
    `;
  }).join("");

  els.teacherProgress.innerHTML = `
    <table class="teacher-progress-table">
      <thead>
        <tr>
          <th>#</th>
          <th>题型</th>
          <th>角色</th>
          <th>题目原文</th>
          <th>标准答案</th>
          <th>学生答案</th>
          <th>听了几次</th>
          <th>状态</th>
          <th>分数</th>
          <th>提交时间</th>
        </tr>
      </thead>
      <tbody>${detailRows}</tbody>
    </table>
  `;
}

function groupProgressByAssignment(rows) {
  const grouped = new Map();
  rows.forEach((row) => {
    if (!grouped.has(row.assignment_id)) grouped.set(row.assignment_id, []);
    grouped.get(row.assignment_id).push(row);
  });
  return grouped;
}

function latestSubmittedAt(rows) {
  return rows
    .filter((row) => row.submitted_at)
    .map((row) => row.submitted_at)
    .sort()
    .at(-1);
}

function currentSegment() {
  return state.lesson.segments[state.currentIndex] || null;
}

function normalizeLesson(rawLesson) {
  const lesson = rawLesson && typeof rawLesson === "object" ? rawLesson : {};
  const rawSegments = Array.isArray(lesson.segments) ? lesson.segments : [];
  const defaultTaskType = normalizeTaskType(lesson.taskType || lesson.mode || lesson.practiceType || lesson.type || lesson.title);
  const materialType = normalizeMaterialType(
    lesson.materialType
    || lesson.contentType
    || lesson.unitType
    || lesson.source?.unitType
    || lesson.category
  );
  const speakers = normalizeSpeakers(lesson.speakers, rawSegments);
  const segments = rawSegments
    .map((segment, index) => {
      const taskType = normalizeTaskType(segment.taskType || segment.mode || segment.practiceType || segment.type || defaultTaskType);
      const text = String(segment.text || segment.transcript || "").trim();
      const rawSpeaker = String(segment.speaker || segment.speakerLabel || "").trim();
      const speakerId = String(segment.speakerId || findSpeakerId(speakers, rawSpeaker) || rawSpeaker).trim();
      const speaker = speakers.find((item) => item.id === speakerId);
      return {
        id: String(segment.id || `s${String(index + 1).padStart(3, "0")}`),
        start: toNumberOrNull(segment.start),
        end: toNumberOrNull(segment.end),
        speakerId,
        speaker: speaker?.label || rawSpeaker,
        speakerRole: String(segment.speakerRole || speaker?.role || "").trim(),
        turnId: String(segment.turnId || segment.turn || "").trim(),
        module: segment.module || "",
        taskType,
        text,
        answerText: String(segment.answerText || segment.expectedAnswer || segment.answer || segment.translation || segment.zh || "").trim(),
      };
    })
    .filter((segment) => segment.text || segment.start !== null || segment.end !== null);

  return {
    id: String(lesson.id || ""),
    schemaVersion: Number(lesson.schemaVersion || 1),
    title: lesson.title || "未命名课程",
    category: lesson.category || "",
    source: lesson.source || "",
    language: lesson.language || "en",
    materialType,
    taskType: defaultTaskType,
    audioSrc: lesson.audioSrc || lesson.audio || "",
    audioFileName: lesson.audioFileName || "",
    speakers,
    workflow: lesson.workflow && typeof lesson.workflow === "object" ? lesson.workflow : {},
    segments,
  };
}

function normalizeMaterialType(value) {
  const text = String(value || "").trim().toLowerCase();
  if (text.includes("conversation") || text.includes("dialogue") || text.includes("dialog") || text.includes("对话")) {
    return "conversation";
  }
  if (text.includes("announcement") || text.includes("notice") || text.includes("通知") || text.includes("公告")) {
    return "announcement";
  }
  if (text.includes("other") || text.includes("其他")) return "other";
  return "lecture";
}

function normalizeSpeakers(rawSpeakers, rawSegments = []) {
  const speakers = Array.isArray(rawSpeakers)
    ? rawSpeakers.map((speaker, index) => {
      const label = String(speaker?.label || speaker?.name || speaker?.speaker || `角色 ${index + 1}`).trim();
      return {
        id: String(speaker?.id || materialSlug(label) || `speaker-${index + 1}`).trim(),
        label,
        role: String(speaker?.role || "").trim(),
      };
    })
    : [];

  rawSegments.forEach((segment) => {
    const label = String(segment?.speaker || segment?.speakerLabel || "").trim();
    const id = String(segment?.speakerId || findSpeakerId(speakers, label) || materialSlug(label)).trim();
    if (!id || speakers.some((speaker) => speaker.id === id)) return;
    speakers.push({
      id,
      label: label || id,
      role: String(segment?.speakerRole || "").trim(),
    });
  });
  return speakers;
}

function findSpeakerId(speakers, label) {
  const normalized = String(label || "").trim().toLowerCase();
  if (!normalized) return "";
  return speakers.find((speaker) => (
    speaker.id.toLowerCase() === normalized
    || speaker.label.toLowerCase() === normalized
  ))?.id || "";
}

function segmentSpeakerLabel(segment, lesson = state.lesson) {
  if (!segment) return "";
  const speaker = (lesson?.speakers || []).find((item) => item.id === segment.speakerId);
  return String(speaker?.label || segment.speaker || segment.speakerId || "").trim();
}

function normalizeTaskType(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("听翻") || text.includes("听译") || text.includes("翻译") || text.includes("translation") || text.includes("translate")) {
    return "translation";
  }
  return "dictation";
}

function clearPracticeData() {
  cancelAudioPreload();
  revokeCachedAudioUrl();
  state.assignment = null;
  state.lesson = normalizeLesson({ title: "未选择任务", segments: [] });
  state.lessonPath = "";
  state.lessonUrl = "";
  state.audioSourceUrl = "";
  clearProgressOnly();
  state.waveform = null;
  if (els.audio) els.audio.removeAttribute("src");
}

function prepareLessonAudio(audioUrl) {
  cancelPendingListenAttempt();
  cancelAudioPreload();
  revokeCachedAudioUrl();
  state.audioSourceUrl = audioUrl;
  state.waveform = null;
  state.audioIsBuffering = false;
  els.audio.preload = "auto";
  els.audio.src = audioUrl;
  els.audio.load();
  enforceNormalPlaybackRate();
  setAudioStatus("音频已关联，正在预加载本地缓存...");

  const token = state.audioLoadToken + 1;
  state.audioLoadToken = token;
  const controller = new AbortController();
  state.audioLoadController = controller;
  preloadAudioBlob(audioUrl, controller.signal, token).catch((error) => {
    if (error?.name === "AbortError") return;
    console.warn("Audio preload failed; using streaming source.", error);
    if (state.audioLoadToken === token) {
      state.audioLoadController = null;
      setAudioStatus("本地缓存失败，已切回在线播放；若卡顿请刷新后重试。", "warning");
    }
  });
}

function cancelAudioPreload() {
  if (state.audioLoadController) {
    state.audioLoadController.abort();
    state.audioLoadController = null;
  }
  state.audioLoadToken += 1;
}

function revokeCachedAudioUrl() {
  if (state.audioObjectUrl) {
    URL.revokeObjectURL(state.audioObjectUrl);
    state.audioObjectUrl = "";
  }
  if (state.pendingAudioObjectUrl) {
    URL.revokeObjectURL(state.pendingAudioObjectUrl);
    state.pendingAudioObjectUrl = "";
  }
}

async function preloadAudioBlob(audioUrl, signal, token) {
  const cachedBlob = await getCachedAudioBlob(audioUrl);
  if (cachedBlob) {
    installCachedAudioBlob(audioUrl, cachedBlob, token, "本地缓存音频已就绪");
    return;
  }

  const blob = await fetchAudioBlobWithRetry(audioUrl, signal, token);
  await storeAudioBlob(audioUrl, blob);
  installCachedAudioBlob(audioUrl, blob, token, "音频已下载到本地缓存");
}

async function getCachedAudioBlob(audioUrl) {
  if (!("caches" in window)) return null;
  try {
    const cache = await caches.open(AUDIO_CACHE_NAME);
    const response = await cache.match(audioUrl);
    if (!response) return null;
    return response.blob();
  } catch (error) {
    console.warn("Audio cache read failed.", error);
    return null;
  }
}

async function fetchAudioBlob(audioUrl, signal, token) {
  const response = await fetch(audioUrl, { cache: "force-cache", signal });
  if (!response.ok) throw new Error(`音频下载失败：HTTP ${response.status}`);

  const total = Number(response.headers.get("content-length") || 0);
  if (!response.body || !total) return response.blob();

  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (state.audioLoadToken === token) {
      const percent = Math.max(1, Math.min(99, Math.round((received / total) * 100)));
      setAudioStatus(`正在缓存音频 ${percent}%...`);
    }
  }
  const type = response.headers.get("content-type") || "audio/mpeg";
  return new Blob(chunks, { type });
}

async function fetchAudioBlobWithRetry(audioUrl, signal, token) {
  let lastError = null;
  for (let attempt = 1; attempt <= AUDIO_PRELOAD_ATTEMPTS; attempt += 1) {
    try {
      return await fetchAudioBlob(audioUrl, signal, token);
    } catch (error) {
      if (error?.name === "AbortError" || signal.aborted) throw error;
      lastError = error;
      console.warn(`Audio preload attempt ${attempt} failed.`, error);
      if (attempt >= AUDIO_PRELOAD_ATTEMPTS) break;
      if (state.audioLoadToken === token) {
        setAudioStatus(`音频缓存中断，正在重试 ${attempt + 1}/${AUDIO_PRELOAD_ATTEMPTS}...`, "warning");
      }
      await delay(AUDIO_PRELOAD_RETRY_DELAY_MS * attempt);
    }
  }
  throw lastError || new Error("音频缓存失败");
}

async function storeAudioBlob(audioUrl, blob) {
  if (!("caches" in window)) return;
  try {
    const cache = await caches.open(AUDIO_CACHE_NAME);
    await cache.put(audioUrl, new Response(blob, { headers: { "Content-Type": blob.type || "audio/mpeg" } }));
  } catch (error) {
    console.warn("Audio cache write failed.", error);
  }
}

function installCachedAudioBlob(audioUrl, blob, token, statusText) {
  if (state.audioLoadToken !== token || state.audioSourceUrl !== audioUrl) return;
  state.audioLoadController = null;
  const objectUrl = URL.createObjectURL(blob);
  const shouldResumeAfterSwitch = !els.audio.paused && state.audioIsBuffering;
  if (!els.audio.paused && !shouldResumeAfterSwitch) {
    if (state.pendingAudioObjectUrl) URL.revokeObjectURL(state.pendingAudioObjectUrl);
    state.pendingAudioObjectUrl = objectUrl;
    setAudioStatus(`${statusText}，本句暂停后自动切换`);
    return;
  }
  if (state.audioObjectUrl) URL.revokeObjectURL(state.audioObjectUrl);
  state.audioObjectUrl = objectUrl;
  switchAudioToCachedUrl(objectUrl, statusText, shouldResumeAfterSwitch);
}

function usePendingCachedAudio() {
  if (!state.pendingAudioObjectUrl || !els.audio.paused) return;
  const objectUrl = state.pendingAudioObjectUrl;
  state.pendingAudioObjectUrl = "";
  if (state.audioObjectUrl && state.audioObjectUrl !== objectUrl) URL.revokeObjectURL(state.audioObjectUrl);
  state.audioObjectUrl = objectUrl;
  switchAudioToCachedUrl(objectUrl, "本地缓存音频已就绪");
}

function switchAudioToCachedUrl(objectUrl, statusText, resumeAfterSwitch = false) {
  const previousTime = Number.isFinite(els.audio.currentTime) ? els.audio.currentTime : 0;
  els.audio.src = objectUrl;
  els.audio.preload = "auto";
  els.audio.load();
  const restoreTime = () => {
    if (previousTime > 0 && Number.isFinite(els.audio.duration)) {
      els.audio.currentTime = Math.min(previousTime, Math.max(0, els.audio.duration - 0.05));
    }
    drawWaveform();
    if (resumeAfterSwitch) safePlay(currentSegment());
  };
  if (els.audio.readyState >= 1) {
    restoreTime();
  } else {
    els.audio.addEventListener("loadedmetadata", restoreTime, { once: true });
  }
  setAudioStatus(statusText);
}

function clearProgressOnly() {
  state.currentIndex = 0;
  state.answers = {};
  state.submitted = {};
  state.playedThrough = {};
  state.listenCounts = {};
  state.scores = {};
  state.submittedAt = {};
  state.unlockedIndex = 0;
  state.notes = "";
  state.activeListenSegmentId = "";
  state.pendingListenAttempt = null;
}

function moveSegment(delta) {
  const nextIndex = Math.max(0, Math.min(state.currentIndex + delta, state.lesson.segments.length - 1));
  selectSegment(nextIndex);
}

function selectSegment(index) {
  if (!canSelectSegment(index)) {
    setAudioStatus(nextGateMessage());
    renderPractice();
    return;
  }
  state.currentIndex = index;
  state.unlockedIndex = Math.max(state.unlockedIndex, index);
  cancelPendingListenAttempt();
  setAudioToSegmentStart();
  els.audio.pause();
  saveLocalProgress();
  scheduleCloudSave(null);
  renderPractice();
}

async function playCurrentSegment(restart) {
  const segment = currentSegment();
  if (!segment || !els.audio.src) return;

  const start = isFiniteNumber(segment.start) ? Number(segment.start) : 0;
  const end = segmentEnd(segment);
  const outsideSegment =
    els.audio.currentTime < start || (isFiniteNumber(end) && els.audio.currentTime >= Number(end) - 0.05);
  const lockedStudentAttempt = isStudent() && !isSubmitted(segment);
  const shouldRestart = lockedStudentAttempt || restart || outsideSegment;
  const shouldCount = lockedStudentAttempt || shouldCountListen(segment, shouldRestart);
  if (!isSubmitted(segment) && shouldCount && getListenCount(segment) >= MAX_PRE_SUBMIT_LISTENS) {
    setAudioStatus(`本句提交前最多听 ${MAX_PRE_SUBMIT_LISTENS} 次。请先提交答案。`);
    renderPractice();
    return;
  }
  if (shouldRestart) els.audio.currentTime = start;

  if (shouldCount) {
    beginPendingListenAttempt(segment, start);
  }
  state.activeListenSegmentId = segment.id;
  await safePlay(segment);
}

function shouldCountListen(segment, restarted) {
  if (restarted) return true;
  if (state.activeListenSegmentId !== segment.id) return true;
  const start = isFiniteNumber(segment.start) ? Number(segment.start) : 0;
  return Math.abs(els.audio.currentTime - start) < 0.35;
}

function recordListenAttempt(segment) {
  state.listenCounts[segment.id] = getListenCount(segment) + 1;
  saveLocalProgress();
  scheduleCloudSave(segment);
  updateListenCountBadge(segment);
}

function beginPendingListenAttempt(segment, start) {
  if (state.pendingListenAttempt?.segmentId === segment.id) return;
  state.pendingListenAttempt = {
    segmentId: segment.id,
    start,
  };
  setAudioStatus("正在加载本句音频；真正播放后才会计入次数。");
  updateListenCountBadge(segment);
}

function cancelPendingListenAttempt() {
  state.pendingListenAttempt = null;
}

function confirmPendingListenAttempt() {
  const pending = state.pendingListenAttempt;
  if (!pending || els.audio.paused) return;
  const segment = currentSegment();
  if (!segment || segment.id !== pending.segmentId) {
    cancelPendingListenAttempt();
    return;
  }
  const end = segmentEnd(segment);
  const requiredProgress = isFiniteNumber(end)
    ? Math.min(LISTEN_COUNT_CONFIRM_SECONDS, Math.max(0.12, (Number(end) - pending.start) * 0.12))
    : LISTEN_COUNT_CONFIRM_SECONDS;
  if (
    els.audio.currentTime < pending.start + requiredProgress &&
    (!isFiniteNumber(end) || els.audio.currentTime < Number(end) - 0.05)
  ) {
    return;
  }
  cancelPendingListenAttempt();
  if (!isSubmitted(segment) && getListenCount(segment) >= MAX_PRE_SUBMIT_LISTENS) {
    setAudioStatus(`本句提交前最多听 ${MAX_PRE_SUBMIT_LISTENS} 次。请先提交答案。`);
    renderPractice();
    return;
  }
  recordListenAttempt(segment);
}

async function togglePlay() {
  if (!els.audio.src) return;
  if (els.audio.paused) {
    await playCurrentSegment(false);
  } else {
    els.audio.pause();
  }
}

async function safePlay(segment) {
  try {
    await els.audio.play();
    confirmPendingListenAttempt();
  } catch (error) {
    cancelPendingListenAttempt();
    console.error("Audio play failed", error);
    setAudioStatus("音频还没有成功播放，本次不扣次数。请再点一次播放。", "warning");
    if (segment) updateListenCountBadge(segment);
  }
}

function onAudioTimeUpdate() {
  const segment = currentSegment();
  const end = segmentEnd(segment);
  state.audioIsBuffering = false;
  confirmPendingListenAttempt();
  if (!segment || !isFiniteNumber(end)) {
    drawWaveform();
    return;
  }
  if (els.audio.currentTime >= Number(end) - 0.25) {
    markSegmentPlayedThrough(segment);
    els.audio.pause();
    els.audio.currentTime = Number(end);
    state.activeListenSegmentId = "";
    drawWaveform();
    return;
  }
  drawWaveform();
}

function seekFromWaveform(event) {
  const segment = currentSegment();
  if (!segment || !els.audio.src) return;
  if (isStudent() && !isSubmitted(segment)) {
    setAudioStatus("提交前不能拖动音频");
    return;
  }
  const duration = getKnownDuration();
  if (!duration) return;
  const rect = els.waveform.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  let targetTime = ratio * duration;
  const end = segmentEnd(segment);
  if (isFiniteNumber(segment.start) && isFiniteNumber(end)) {
    targetTime = Math.max(Number(segment.start), Math.min(Number(end), targetTime));
  }
  els.audio.currentTime = targetTime;
  drawWaveform();
}

function submitAnswer() {
  const segment = currentSegment();
  if (!segment || isSubmitted(segment)) return;
  const value = els.dictationInput.value.trim();
  if (!value) {
    els.scoreBadge.className = "score-badge is-low";
    els.scoreBadge.textContent = "请先输入";
    return;
  }

  const now = new Date().toISOString();
  const score = scoreAnswer(segmentAnswerText(segment), value);
  state.answers[segment.id] = els.dictationInput.value;
  state.submitted[segment.id] = true;
  state.scores[segment.id] = score;
  state.submittedAt[segment.id] = now;
  state.unlockedIndex = computeUnlockedIndex();

  if (canAdvanceFromCurrent()) {
    setAudioStatus("本句完成，可以进入下一句");
  } else {
    setAudioStatus("答案已提交，请继续播放到本句结束");
  }
  saveLocalProgress();
  scheduleCloudSave(segment, 0);
  renderPractice();
}

function markSegmentPlayedThrough(segment) {
  if (!segment || state.playedThrough[segment.id]) return;
  state.playedThrough[segment.id] = true;
  state.unlockedIndex = computeUnlockedIndex();
  setAudioStatus(isSubmitted(segment) ? "本句完成，可以进入下一句" : "已听到本句结束，请提交答案");
  saveLocalProgress();
  scheduleCloudSave(segment, 0);
  renderPractice();
}

function canListenNow(segment) {
  return isSubmitted(segment) || getListenCount(segment) < MAX_PRE_SUBMIT_LISTENS;
}

function canAdvanceFromCurrent() {
  const segment = currentSegment();
  if (!segment) return false;
  const hasKnownEnd = isFiniteNumber(segmentEnd(segment));
  return isSubmitted(segment) && (isPlayedThrough(segment) || !hasKnownEnd);
}

function canSelectSegment(index) {
  if (!state.lesson.segments.length) return false;
  if (index === state.currentIndex) return true;
  if (index <= state.unlockedIndex) return true;
  return index === state.unlockedIndex + 1 && state.currentIndex === state.unlockedIndex && canAdvanceFromCurrent();
}

function computeUnlockedIndex() {
  if (!state.lesson.segments.length) return 0;
  let unlocked = 0;
  for (let index = 0; index < state.lesson.segments.length; index += 1) {
    const segment = state.lesson.segments[index];
    const hasKnownEnd = isFiniteNumber(segmentEnd(segment));
    const done = isSubmitted(segment) && (isPlayedThrough(segment) || !hasKnownEnd);
    if (!done) break;
    unlocked = Math.min(index + 1, state.lesson.segments.length - 1);
  }
  return unlocked;
}

function firstOpenIndex() {
  const index = state.lesson.segments.findIndex((segment) => !isSubmitted(segment));
  return index >= 0 ? index : Math.max(0, state.lesson.segments.length - 1);
}

function nextGateMessage() {
  const segment = currentSegment();
  if (!segment || canAdvanceFromCurrent()) return "";
  const heard = isPlayedThrough(segment) || !isFiniteNumber(segmentEnd(segment));
  if (!heard && !isSubmitted(segment)) return "下一句锁定：请先听完整句并提交答案";
  if (!heard) return "下一句锁定：请先听到本句结束";
  if (!isSubmitted(segment)) return "下一句锁定：请先提交本句答案";
  return "";
}

function setAudioToSegmentStart() {
  const segment = currentSegment();
  if (!segment || !els.audio.src) return;
  els.audio.currentTime = isFiniteNumber(segment.start) ? Number(segment.start) : 0;
}

function segmentEnd(segment) {
  if (!segment) return null;
  if (isFiniteNumber(segment.end)) return Number(segment.end);
  const segmentIndex = state.lesson.segments.findIndex((candidate) => candidate.id === segment.id);
  const next = state.lesson.segments[segmentIndex + 1];
  if (next && isFiniteNumber(next.start)) return Number(next.start);
  const duration = getMediaDuration();
  if (duration && (!isFiniteNumber(segment.start) || duration > Number(segment.start))) return duration;
  return null;
}

function resizeWaveform() {
  const canvas = els.waveform;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(320, Math.floor(rect.width * ratio));
  canvas.height = Math.floor(160 * ratio);
}

function drawWaveform() {
  const canvas = els.waveform;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const ratio = window.devicePixelRatio || 1;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, width, height);

  const duration = getKnownDuration();
  const active = currentSegment();
  const activeEnd = segmentEnd(active);
  if (active && duration && active.start !== null && activeEnd !== null) {
    const startX = (Number(active.start) / duration) * width;
    const endX = (Number(activeEnd) / duration) * width;
    ctx.fillStyle = "rgba(15, 118, 110, 0.14)";
    ctx.fillRect(startX, 0, Math.max(3 * ratio, endX - startX), height);
  }

  ctx.strokeStyle = "#aab8c5";
  ctx.lineWidth = Math.max(1, ratio);
  const midY = height / 2;
  for (let x = 0; x < width; x += 10 * ratio) {
    const bar = ((x / width) * 0.5 + 0.35) * height * 0.42;
    ctx.beginPath();
    ctx.moveTo(x, midY - bar / 2);
    ctx.lineTo(x, midY + bar / 2);
    ctx.stroke();
  }

  const current = duration ? (els.audio.currentTime / duration) * width : 0;
  ctx.strokeStyle = "#be123c";
  ctx.lineWidth = Math.max(2, ratio * 2);
  ctx.beginPath();
  ctx.moveTo(current, 0);
  ctx.lineTo(current, height);
  ctx.stroke();
}

function getKnownDuration() {
  const mediaDuration = getMediaDuration();
  if (mediaDuration) return mediaDuration;
  const ends = state.lesson.segments.map((segment) => segment.end || 0);
  return Math.max(0, ...ends);
}

function getMediaDuration() {
  if (Number.isFinite(els.audio.duration) && els.audio.duration > 0) return els.audio.duration;
  return 0;
}

function saveLocalProgress() {
  if (!state.assignment || !state.session) return;
  localStorage.setItem(
    progressStorageKey(),
    JSON.stringify({
      assignmentId: state.assignment.id,
      lessonPath: state.lessonPath,
      currentIndex: state.currentIndex,
      answers: state.answers,
      submitted: state.submitted,
      playedThrough: state.playedThrough,
      listenCounts: state.listenCounts,
      scores: state.scores,
      submittedAt: state.submittedAt,
      unlockedIndex: state.unlockedIndex,
      notes: state.notes,
      savedAt: new Date().toISOString(),
    }),
  );
}

function applyLocalProgress() {
  if (!state.assignment || !state.session) return;
  try {
    const saved = JSON.parse(localStorage.getItem(progressStorageKey()) || "{}");
    if (saved.assignmentId !== state.assignment.id) return;
    state.currentIndex = Number.isInteger(saved.currentIndex) ? saved.currentIndex : 0;
    state.answers = saved.answers || {};
    state.submitted = saved.submitted || {};
    state.playedThrough = saved.playedThrough || {};
    state.listenCounts = saved.listenCounts || {};
    state.scores = saved.scores || {};
    state.submittedAt = saved.submittedAt || {};
    state.unlockedIndex = Number.isInteger(saved.unlockedIndex) ? saved.unlockedIndex : computeUnlockedIndex();
    state.notes = saved.notes || "";
  } catch (error) {
    clearProgressOnly();
  }
}

function scheduleCloudSave(segment, delay = 650) {
  if (!state.assignment || !state.session || !isStudent()) return;
  state.pendingSaveRequested = true;
  if (segment) state.pendingSaveSegmentId = segment.id;
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(() => saveCloudProgress(segment), delay);
}

async function saveCloudProgress(segment, options = {}) {
  if (!state.assignment || !state.session || !isStudent()) return;
  if (state.saving) {
    state.pendingSaveRequested = true;
    if (segment) state.pendingSaveSegmentId = segment.id;
    return;
  }

  state.saving = true;
  state.pendingSaveRequested = false;
  setSyncStatus("同步中", "warning");
  try {
    const targetSegment = segment || currentSegment();
    const segmentPayload = targetSegment ? segmentProgressPayload(targetSegment) : null;
    await persistCloudProgress(assignmentProgressPayload(), segmentPayload);
    if (segmentPayload) mergeStudentProgressRow(segmentPayload);

    setSyncStatus(options.statusText || "已保存", "");
  } catch (error) {
    reportCloudError("云端保存失败", error);
  } finally {
    state.saving = false;
    const pendingId = state.pendingSaveSegmentId;
    const pendingRequested = state.pendingSaveRequested;
    state.pendingSaveSegmentId = "";
    state.pendingSaveRequested = false;
    if (pendingRequested || (pendingId && (!segment || pendingId !== segment.id))) {
      const pending = state.lesson.segments.find((item) => item.id === pendingId);
      saveCloudProgress(pending || null);
    }
  }
}

function assignmentProgressPayload() {
  const completed = state.lesson.segments.length > 0 && state.lesson.segments.every((item) => {
    const hasKnownEnd = isFiniteNumber(segmentEnd(item));
    return isSubmitted(item) && (isPlayedThrough(item) || !hasKnownEnd);
  });
  return {
    assignment_id: state.assignment.id,
    student_id: state.session.user.id,
    current_segment_index: state.currentIndex,
    completed,
    completed_at: completed ? new Date().toISOString() : null,
    notes: state.notes || null,
    updated_at: new Date().toISOString(),
  };
}

async function persistCloudProgress(progressPayload, segmentPayload) {
  const rpcParams = {
    p_assignment_id: progressPayload.assignment_id,
    p_current_segment_index: progressPayload.current_segment_index,
    p_completed: progressPayload.completed,
    p_completed_at: progressPayload.completed_at,
    p_notes: progressPayload.notes,
    p_segment: segmentPayload,
  };
  const { error } = await state.supabase.rpc("save_student_progress", rpcParams);
  if (!error) return;
  if (!isMissingRpcError(error)) throw error;
  console.warn("save_student_progress RPC is missing; falling back to direct Supabase upsert.", error);
  await persistCloudProgressDirect(progressPayload, segmentPayload);
}

async function persistCloudProgressDirect(progressPayload, segmentPayload) {
  const { error: progressError } = await state.supabase
    .from("assignment_progress")
    .upsert(progressPayload, { onConflict: "assignment_id" });
  if (progressError) throw progressError;

  if (segmentPayload) {
    const { error: rowError } = await state.supabase
      .from("segment_progress")
      .upsert(segmentPayload, { onConflict: "assignment_id,segment_id" });
    if (rowError) throw rowError;
  }
}

function segmentProgressPayload(segment) {
  return {
    assignment_id: state.assignment.id,
    student_id: state.session.user.id,
    segment_id: segment.id,
    segment_index: state.lesson.segments.findIndex((item) => item.id === segment.id),
    listen_count: getListenCount(segment),
    answer: state.answers[segment.id] || "",
    submitted: isSubmitted(segment),
    score: state.scores[segment.id] ?? null,
    submitted_at: state.submittedAt[segment.id] || null,
    heard_through: isPlayedThrough(segment),
    updated_at: new Date().toISOString(),
  };
}

function mergeStudentProgressRow(row) {
  const index = state.studentProgressRows.findIndex(
    (item) => item.assignment_id === row.assignment_id && item.segment_id === row.segment_id,
  );
  if (index >= 0) state.studentProgressRows[index] = { ...state.studentProgressRows[index], ...row };
  else state.studentProgressRows.push({ ...row });
  renderStudentAssignments();
}

function assignmentProgressPercent(assignment) {
  const rows = state.studentProgressRows.filter((row) => row.assignment_id === assignment.id);
  const submittedCount = rows.filter((row) => row.submitted).length;
  const total = assignment.lesson_segment_count || 0;
  return total ? Math.round((submittedCount / total) * 100) : 0;
}

function progressStorageKey() {
  return `${STORAGE_PREFIX}${state.session.user.id}:${state.assignment.id}`;
}

function selectedAssignmentKey() {
  return `${STORAGE_PREFIX}${state.session?.user?.id || "anon"}:selected-assignment`;
}

function studentSelectionKey() {
  return `${STORAGE_PREFIX}student-selection`;
}

function studentNameKey() {
  return `${STORAGE_PREFIX}student-name`;
}

function updateSentenceStatus(segment) {
  if (!segment) {
    els.sentenceStatus.textContent = "待开始";
    els.sentenceStatus.dataset.state = "idle";
    return;
  }
  const heard = isPlayedThrough(segment) || !isFiniteNumber(segmentEnd(segment));
  const submitted = isSubmitted(segment);
  if (heard && submitted) {
    els.sentenceStatus.textContent = "已听完 · 已提交";
    els.sentenceStatus.dataset.state = "done";
  } else if (heard) {
    els.sentenceStatus.textContent = "已听完 · 待提交";
    els.sentenceStatus.dataset.state = "heard";
  } else if (submitted) {
    els.sentenceStatus.textContent = "已提交 · 待听完";
    els.sentenceStatus.dataset.state = "submitted";
  } else {
    els.sentenceStatus.textContent = "待听完 · 待提交";
    els.sentenceStatus.dataset.state = "pending";
  }
}

function updateListenCountBadge(segment) {
  if (!segment) {
    els.listenCountBadge.textContent = `听 0/${MAX_PRE_SUBMIT_LISTENS}`;
    return;
  }
  const count = getListenCount(segment);
  const pending = state.pendingListenAttempt?.segmentId === segment.id;
  els.listenCountBadge.textContent = isSubmitted(segment)
    ? `听 ${count} 次`
    : `听 ${count}/${MAX_PRE_SUBMIT_LISTENS}${pending ? " · 加载中" : ""}`;
  els.listenCountBadge.className = "status-pill";
  if (!isSubmitted(segment) && count >= MAX_PRE_SUBMIT_LISTENS) els.listenCountBadge.classList.add("is-danger");
}

function updateScoreBadge(segment) {
  if (!segment) {
    els.scoreBadge.className = "score-badge";
    els.scoreBadge.textContent = "未作答";
    return;
  }
  if (!isSubmitted(segment)) {
    els.scoreBadge.className = "score-badge";
    els.scoreBadge.textContent = (state.answers[segment.id] || "").trim() ? "未提交" : "未作答";
    return;
  }
  const score = state.scores[segment.id] ?? scoreAnswer(segmentAnswerText(segment), state.answers[segment.id] || "");
  els.scoreBadge.textContent = `${score}%`;
  els.scoreBadge.className = "score-badge";
  if (score >= 85) els.scoreBadge.classList.add("is-high");
  else if (score >= 60) els.scoreBadge.classList.add("is-mid");
  else els.scoreBadge.classList.add("is-low");
}

function isSubmitted(segment) {
  return Boolean(segment && state.submitted[segment.id]);
}

function isTranslationSegment(segment) {
  return segment?.taskType === "translation";
}

function segmentAnswerText(segment) {
  if (!segment) return "";
  if (isTranslationSegment(segment)) return segment.answerText || "";
  return segment.answerText || segment.text || "";
}

function isPlayedThrough(segment) {
  return Boolean(segment && state.playedThrough[segment.id]);
}

function getListenCount(segment) {
  return Number(state.listenCounts[segment?.id] || 0);
}

function isTeacher() {
  return state.profile?.role === "teacher" && isFixedTeacherEmail(state.profile.email || state.session?.user?.email);
}

function isStudent() {
  return state.profile?.role === "student";
}

function disableAuthControls(disabled) {
  if (els.signInButton) els.signInButton.disabled = disabled;
  if (els.signUpButton) els.signUpButton.disabled = disabled;
  if (els.studentModeButton) els.studentModeButton.disabled = disabled;
  if (els.teacherModeButton) els.teacherModeButton.disabled = disabled;
}

function setAuthStatus(text) {
  els.authStatus.textContent = text;
}

function setAudioStatus(text, tone = "") {
  if (!text) return;
  els.audioStatus.textContent = text;
  els.audioStatus.className = "course-status";
  if (tone) els.audioStatus.classList.add(`is-${tone}`);
}

function setSyncStatus(text, tone) {
  els.syncStatus.textContent = text;
  els.syncStatus.className = "status-pill";
  if (tone) els.syncStatus.classList.add(`is-${tone}`);
}

function reportCloudError(label, error) {
  console.error(label, error);
  const message = cloudErrorMessage(error);
  setSyncStatus(`${label}：${message}`, "danger");
  setAudioStatus(`${label}：${message}`, "danger");
}

function cloudErrorMessage(error) {
  return error?.message || error?.error_description || error?.details || String(error);
}

function enforceNormalPlaybackRate() {
  if (!els.audio || els.audio.playbackRate === 1) return;
  els.audio.playbackRate = 1;
}

async function copyCurrentSegment() {
  const segment = currentSegment();
  if (!segment || !isSubmitted(segment)) return;
  try {
    await navigator.clipboard.writeText(segment.text);
    setAudioStatus("已复制本句原文");
  } catch (error) {
    setAudioStatus("浏览器不允许复制，请手动选择提交后的原文。");
  }
}

function maskText(text) {
  return String(text || "")
    .split(/(\s+)/)
    .map((token) => {
      if (/^\s+$/.test(token)) return " ";
      if (!token) return "";
      const width = Math.max(22, Math.min(120, token.length * 11));
      return `<span class="blank-token" style="width:${width}px"></span>`;
    })
    .join("");
}

function scoreAnswer(reference, answer) {
  const ref = answerTokens(reference);
  const hyp = answerTokens(answer);
  if (!ref.length) return 0;
  const distance = levenshtein(ref, hyp);
  return Math.max(0, Math.round((1 - distance / ref.length) * 100));
}

function answerTokens(value) {
  const raw = String(value || "");
  if (/[\u3400-\u9fff]/.test(raw)) {
    return raw
      .replace(/[^\u3400-\u9fffA-Za-z0-9]/g, "")
      .toLowerCase()
      .split("")
      .filter(Boolean);
  }
  return normalizeText(raw).split(" ").filter(Boolean);
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function formatTime(value) {
  if (!isFiniteNumber(value)) return "--:--";
  const minutes = Math.floor(Number(value) / 60);
  const seconds = Math.floor(Number(value) % 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatDateTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function handleKeyboard(event) {
  if (!isStudent()) return;
  if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement) return;
  if (event.code === "Space") {
    event.preventDefault();
    togglePlay();
  } else if (event.code === "ArrowLeft") {
    moveSegment(-1);
  } else if (event.code === "ArrowRight") {
    moveSegment(1);
  } else if (event.code === "KeyR") {
    playCurrentSegment(true);
  }
}
