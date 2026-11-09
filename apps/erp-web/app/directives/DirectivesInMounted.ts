// 该封装配置用于快速构建指令，改进了原始指令生命周期隔离的配置方式，使得周期间的数据是通用且响应的
// 原本binding并非响应式，此封装用于将binding变为响应式
// 用该方式有一个限制：必须要整el在实例存在期间不能变
import { reactive, ref } from "vue";
import type { Reactive, ObjectDirective, DirectiveBinding, Ref } from "vue";
import find_in_list from "~/utils/find_in_list";

type VHookNames = Exclude<
    keyof ObjectDirective,
    "created" | "beforeMount" | "mounted"
>;

type temp_VHookNames = "updated" | "beforeUnmount" | "unmounted";

type VHookFn = (hookName: temp_VHookNames, hook: () => void) => void;

type DirectiveScope = (
    el: HTMLElement,
    binding: Reactive<DirectiveBinding>,
    onHook: VHookFn
) => void;

interface VDirectiveInstance {
    el: HTMLElement; // key
    arg: DirectiveBinding["arg"]; // key
    modifiers: String; // key
    binding: Reactive<DirectiveBinding>;
    hooks: {
        [key in VHookNames]?: any[];
    };
}

const goHook = (vdi: VDirectiveInstance, hookName: VHookNames) => {
    if (vdi.hooks[hookName]) {
        vdi.hooks[hookName].forEach((hook) => hook());
    }
};

const refreshVDI = (
    el: HTMLElement,
    binding: DirectiveBinding,
    directiveStorage: Array<VDirectiveInstance>,
    create: boolean = false
): VDirectiveInstance => {
    const key = {
        el,
        arg: binding.arg,
        modifiers: JSON.stringify(binding.modifiers),
    };
    const result = find_in_list(directiveStorage, key);

    if (!result) {
        if (create) {
            const o: VDirectiveInstance = {
                ...key,
                binding: Object.assign(reactive({}), binding),
                hooks: {},
            };
            // console.log(binding.value, o.binding.value, binding.value === o.binding.value);
            
            directiveStorage.push(o);
            return o;
        }
        // 触发控制台警告: 指令的arg或modifiers不应该发生变化一旦指令被绑定
        console.warn(
            "arg or modifiers should not change after the directive is bound."
        );
        // 触发报错: 虚拟指令实例（VDirectiveInstance）绑定的生命周期hook无法找到并执行, 内存可能会泄露
        throw new Error(
            "VDirectiveInstance binding lifecycle hook not found and executed, memory may leak."
        );
    } else {
        Object.assign(result.item.binding, binding);
        // console.log(result.item.binding.value, binding.value, result.item.binding.value === binding.value);
        
    }
    return result.item;
};

export default function (
    mountedScope: DirectiveScope,
    options?: never
): ObjectDirective {
    const directiveStorage: Array<VDirectiveInstance> = [];

    return {
        created(el, binding) {
            // console.log('created');
            
            const vdi = refreshVDI(el, binding, directiveStorage, true);
        },
        mounted(el, binding) {
            // console.log('mounted');
            const vdi = refreshVDI(el, binding, directiveStorage);

            const injectHook: VHookFn = (hookName, hook) => {
                const hookList =
                    vdi.hooks[hookName] ?? (vdi.hooks[hookName] = []);
                hookList.push(hook);
            };

            mountedScope(el, vdi.binding, injectHook);
        },
        updated(el, binding) {
            // console.log('updated');
            
            const vdi = refreshVDI(el, binding, directiveStorage);
            
            goHook(vdi, "updated");
        },
        beforeUnmount(el, binding) {
            // console.log('beforeUnmount');
            const vdi = refreshVDI(el, binding, directiveStorage);
            goHook(vdi, "beforeUnmount");
        },
        unmounted(el, binding) {
            // console.log('unmounted');
            const vdi = refreshVDI(el, binding, directiveStorage);
            goHook(vdi, "beforeUnmount");

            const index = directiveStorage.indexOf(vdi);
            directiveStorage.splice(index, 1);
        },
    };
}
