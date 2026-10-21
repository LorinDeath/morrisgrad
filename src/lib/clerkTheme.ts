// Единый вид формы входа Clerk (тот же компонент <SignIn/>/<SignUp/> и те же способы входа, что в окне сайта:
// Google, Discord, Twitch, почта/логин — их список задаёт панель Clerk, а не код). Здесь — только оформление и язык.
// Сейчас применяется в игре (оверлей входа «Проклятых», src/scripts/mcAuthGate.ts). Окно входа сайта пока НЕ меняем:
// когда решим — достаточно передать то же самое в astro.config.mjs → clerk({ appearance: mcClerkAppearance, localization: mcClerkLocalization }).
import { ruRU } from "@clerk/localizations";

// палитра проклятого интерфейса (styles/ui-cursed.css :root)
export const MC_CLERK_COLORS = {
  face0: "#0b0a12", face1: "#120e1c", face2: "#1b1529", outline: "#1a1626",
  v0: "#2e1640", v1: "#7a2e8a", v2: "#c46ad8", v3: "#e2b6ee",
  text: "#dcd3e6", text2: "#a99cb8", text3: "#7d7090", gold: "#e9c98a", bad: "#f08a8a", good: "#8fd6a0",
};
const C = MC_CLERK_COLORS;

export const mcClerkAppearance = {
  variables: {
    colorPrimary: C.v1,
    colorDanger: C.bad,
    colorSuccess: C.good,
    colorWarning: "#f0c070",
    colorNeutral: C.text,
    colorText: C.text,
    colorTextSecondary: C.text2,
    colorTextOnPrimaryBackground: "#fff",
    colorBackground: C.face1,
    colorInputBackground: C.face0,
    colorInputText: C.text,
    colorShimmer: "rgba(196,106,216,.25)",
    fontFamily: "'Exo 2', system-ui, sans-serif",
    fontFamilyButtons: "'Exo 2', system-ui, sans-serif",
    borderRadius: "3px",
  },
  elements: {
    rootBox: { width: "100%" },
    cardBox: { width: "100%", maxWidth: "100%", boxShadow: "none", border: `1px solid ${C.v0}`, borderRadius: "4px" },
    card: { background: `linear-gradient(180deg, ${C.face2}, ${C.face1})`, boxShadow: "none", border: "none" },
    headerTitle: { fontFamily: "'Shket', 'Cinzel', serif", letterSpacing: ".04em", color: C.v3, fontSize: "1.25rem" },
    headerSubtitle: { color: C.text2 },
    socialButtonsBlockButton: { background: C.face0, border: `1px solid ${C.v0}`, color: C.text },
    socialButtonsIconButton: { background: C.face0, border: `1px solid ${C.v0}` },
    dividerLine: { background: C.v0 },
    dividerText: { color: C.text3 },
    formFieldInput: { border: `1px solid ${C.v0}`, background: C.face0, color: C.text },
    formButtonPrimary: { background: `linear-gradient(180deg, ${C.v1}, ${C.v0})`, border: `1px solid ${C.v2}`, boxShadow: "0 0 12px rgba(196,106,216,.25)", textTransform: "none" },
    footer: { background: C.face0, borderTop: `1px solid ${C.v0}` },
    footerActionLink: { color: C.v2 },
    identityPreviewEditButton: { color: C.v2 },
    otpCodeFieldInput: { border: `1px solid ${C.v0}`, background: C.face0, color: C.text },
    alertText: { color: C.text },
  },
} as const;

// Русский язык: ruRU из @clerk/localizations + наши заголовки (вместо «Войти в "MorrisGrad"» из имени приложения в Clerk)
export const mcClerkLocalization = {
  ...ruRU,
  signIn: {
    ...ruRU.signIn,
    start: { ...ruRU.signIn?.start, title: "Вход в МоррисГрад", subtitle: "С возвращением! Войдите, чтобы продолжить", titleCombined: "Вход в МоррисГрад", subtitleCombined: "С возвращением! Войдите, чтобы продолжить" },
  },
  signUp: {
    ...ruRU.signUp,
    start: { ...ruRU.signUp?.start, title: "Регистрация в МоррисГраде", subtitle: "Станьте жителем МоррисГрада — прогресс героя сохранится в аккаунте", titleCombined: "Регистрация в МоррисГраде", subtitleCombined: "Станьте жителем МоррисГрада" },
  },
} as any;
