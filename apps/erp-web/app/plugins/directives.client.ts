import useObserver from "~/directives/useObserver";
import useSort from "~/directives/useSort";
import useHover from "~/directives/useHover";
import useFocus from "~/directives/useFocus";

export default defineNuxtPlugin((nuxtApp) => {
    nuxtApp.vueApp.directive("observer", useObserver);
    nuxtApp.vueApp.directive("sort", useSort);
    nuxtApp.vueApp.directive("hover", useHover);
    nuxtApp.vueApp.directive("focus", useFocus);
})