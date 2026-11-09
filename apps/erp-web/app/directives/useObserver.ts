import { ref, reactive, createApp, watchEffect, toRaw } from "vue";

export default {
    mounted(el: any, binding: any, vnode: any) {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                binding.value({ mutation, el });
            });
        });

        // 配置观察选项
        const config = {
            childList: true, // 观察子元素的添加和删除
            attributes: true, // 观察属性的变化
            characterData: true, // 观察文本内容的变化
            subtree: true, // 观察目标元素的所有后代元素
        };

        observer.observe(el, config);

    },
};
