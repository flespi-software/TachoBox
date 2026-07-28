import { ref } from 'vue'

// Singleton state for the violation-detail dialog. Any component that displays a
// violation can call openViolation(v) to pop the shared dialog; the dialog itself
// is mounted once at the app level (IndexPage).
const active = ref(null)

export function useViolationDialog() {
  return {
    activeViolation: active,
    openViolation: (v) => { active.value = v },
    closeViolation: () => { active.value = null },
  }
}
