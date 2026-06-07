// Adds teacher-side assignment deletion without changing the main LMS bundle.
(function patchTeacherAssignmentDelete() {
  const PATCH_KEY = "__listeningLabTeacherDeletePatchApplied";
  if (window[PATCH_KEY]) return;
  window[PATCH_KEY] = true;

  function waitForAppGlobals() {
    if (
      typeof renderTeacherAssignments !== "function" ||
      typeof loadTeacherDashboard !== "function" ||
      typeof isTeacher !== "function" ||
      typeof state === "undefined" ||
      typeof els === "undefined"
    ) {
      window.setTimeout(waitForAppGlobals, 50);
      return;
    }
    installPatch();
  }

  function installPatch() {
    const originalRenderTeacherAssignments = renderTeacherAssignments;
    renderTeacherAssignments = function patchedRenderTeacherAssignments(...args) {
      const result = originalRenderTeacherAssignments.apply(this, args);
      injectDeleteControls();
      return result;
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", injectDeleteControls);
    } else {
      injectDeleteControls();
    }
  }

  function injectDeleteControls() {
    if (!els.teacherAssignments || !isTeacher()) return;
    const table = els.teacherAssignments.querySelector("table");
    if (!table) return;

    const headerRow = table.querySelector("thead tr");
    if (headerRow && !headerRow.querySelector("[data-delete-column]")) {
      const headerCell = document.createElement("th");
      headerCell.dataset.deleteColumn = "true";
      headerCell.textContent = "操作";
      headerRow.appendChild(headerCell);
    }

    table.querySelectorAll("tbody tr").forEach((row) => {
      if (row.querySelector("[data-delete-cell]")) return;
      const viewButton = row.querySelector("[data-view-assignment]");
      const assignmentId = viewButton?.dataset?.viewAssignment;
      if (!assignmentId) return;

      const cell = document.createElement("td");
      cell.dataset.deleteCell = "true";

      const button = document.createElement("button");
      button.className = "ghost-button small-button";
      button.type = "button";
      button.textContent = "删除";
      button.dataset.deleteAssignment = assignmentId;
      button.addEventListener("click", async () => deleteTeacherAssignment(assignmentId, button));

      cell.appendChild(button);
      row.appendChild(cell);
    });
  }

  async function deleteTeacherAssignment(assignmentId, button) {
    if (!isTeacher() || !assignmentId || !state.supabase || !state.session?.user?.id) return;

    const assignment = state.teacherAssignments.find((item) => item.id === assignmentId);
    if (!assignment) return;

    const student = state.students.find((item) => item.id === assignment.student_id);
    const studentName = student?.full_name || student?.email || "未知学生";
    const ok = window.confirm(
      `确定删除这个任务吗？\n\n学生：${studentName}\n任务：${assignment.lesson_title}\n\n删除后学生端将不再显示，已有进度也会一起删除。`
    );
    if (!ok) return;

    const previousText = button?.textContent || "删除";
    if (button) {
      button.disabled = true;
      button.textContent = "删除中...";
    }
    if (els.teacherStatus) els.teacherStatus.textContent = "正在删除任务...";

    try {
      const { error } = await state.supabase
        .from("assignments")
        .delete()
        .eq("id", assignmentId)
        .eq("teacher_id", state.session.user.id);

      if (error) throw error;

      if (state.selectedTeacherAssignmentId === assignmentId) {
        state.selectedTeacherAssignmentId = "";
      }
      delete state.teacherLessonDetails[assignment.lesson_path];

      if (els.teacherStatus) els.teacherStatus.textContent = "任务已删除";
      await loadTeacherDashboard();
    } catch (error) {
      if (els.teacherStatus) els.teacherStatus.textContent = `删除失败：${formatDeleteError(error)}`;
      if (button) {
        button.disabled = false;
        button.textContent = previousText;
      }
    }
  }

  function formatDeleteError(error) {
    if (typeof cloudErrorMessage === "function") return cloudErrorMessage(error);
    return error?.message || String(error || "未知错误");
  }

  waitForAppGlobals();
})();
