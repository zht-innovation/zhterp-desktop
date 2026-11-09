import { ref, reactive, toRef, watchEffect, toRaw } from "vue";
import DirectivesInMounted from "./DirectivesInMounted";

export default DirectivesInMounted((el, binding, onHook) => {
    el.focus();
});
