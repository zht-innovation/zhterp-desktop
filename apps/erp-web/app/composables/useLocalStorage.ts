import { type Reactive, reactive, watch } from "vue";
import {
    type LocalStorageEditor,
    type LocalStorageConfigInfo,
    type LocalStorageOthOpt,
    type LocalStorageIndexFile,
} from "~/types/configuration";

const all = {};
const DEFAULT_KEY = "config_editor" as const;

// 为便于维护创建的全部KEY，
// 如果你需要使用其他键，请在下方添加重载声明
type LocalStorageMap = {
    [DEFAULT_KEY]: LocalStorageEditor;
    config_info: LocalStorageConfigInfo;
    other_option: LocalStorageOthOpt;
    index_file: LocalStorageIndexFile;
};

export default function useLocalStorage(
    KEY?: typeof DEFAULT_KEY,
): LocalStorageEditor;
export default function useLocalStorage(
    validation: LocalStorageEditor,
): LocalStorageEditor;
export default function useLocalStorage<K extends keyof LocalStorageMap>(
    KEY: K,
    validate?: LocalStorageMap[K],
): LocalStorageMap[K];

export default function useLocalStorage<T extends object>(
    KEY?: string | T,
    validation?: T,
): Reactive<T> {
    // 判断参数类型 并 初始化格式
    if (typeof KEY !== "string") {
        validation = KEY as T;
        KEY = DEFAULT_KEY;
    }

    let obj = {};

    try {
        obj = JSON.parse(localStorage.getItem(KEY) || "") || {};
    } catch (e) {}

    // 不能是数组
    if (Array.isArray(obj)) {
        obj = {};
    }

    if (!all[KEY]) {
        all[KEY] = reactive(obj);
    } else {
        // 初始化的更新
        // 如果已经存在，则更新为最新的对象
        // 先删除obj里没有的字段
        for (const key in all[KEY]) {
            if (obj[key] === undefined) {
                delete all[KEY][key];
            }
        }
        Object.assign(all[KEY], obj);
    }
    const ls_obj = all[KEY];
    //保持reactive对象与storage的同步
    window.addEventListener("storage", function (event) {
        if (event.key !== KEY) return;
        if (event.newValue === event.oldValue) return;
        const obj = JSON.parse(event.newValue||'{}')
        for (const key in ls_obj) {
            if (obj[key] === undefined) {
                delete ls_obj[key];
            }
        }
        Object.assign(ls_obj, obj);
    });

    // 如果有验证对象，则进行验证纠错
    if (validation) {
        const validateFn = (valid: object, ls: object) => {
            for (const key in valid) {
                // key是validation中的属性，检查ls_obj中是否有这个属性,
                // 若没有则将validation中的这个值赋给ls_obj，
                // 若有则检查他们的类型是否一致，不一致则将ls_obj中的值改为validation中的值
                if (ls[key] === undefined) {
                    ls[key] = valid[key];
                } else if (typeof ls[key] !== typeof valid[key]) {
                    ls[key] = valid[key];
                } else if (
                    Array.isArray(ls[key]) !== Array.isArray(valid[key])
                ) {
                    ls[key] = valid[key];
                } else if (
                    typeof ls[key] === "object" &&
                    !Array.isArray(ls[key])
                ) {
                    validateFn(valid[key], ls[key]);
                }
            }
        };
        validateFn(validation, ls_obj);
    }

    watch(
        ls_obj,
        (to) => {
            try {
                localStorage.setItem(KEY as string, JSON.stringify(to));
            } catch (e) {}
        },
        { immediate: true },
    );

    return ls_obj as Reactive<T>;
}
