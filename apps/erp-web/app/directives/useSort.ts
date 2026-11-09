import { ref, reactive, toRef, watchEffect, toRaw } from "vue";
import DirectivesInMounted from "./DirectivesInMounted";

// 记录所有的拖拽组合
const Args: { [key: string]: any } = {};
const Scrolls: { [key: string]: any } = {};

export default DirectivesInMounted((el, binding, onHook) => {
    mainFn(el, binding);

    onHook("beforeUnmount", () => {
        if (binding.modifiers.root) {
            const arg = binding.arg;
            if (!arg) return;
            if (Args[arg]) {
                delete Args[arg];
            }
            if (Scrolls[arg]) {
                delete Scrolls[arg];
            }
        }
    });
});

const mainFn = (el: any, binding: any) => {
    if (binding.modifiers.root) {
        const arg = binding.arg;
        if (!arg) throw new Error(`arg ${arg}.root is required`);
        if (Args[arg]) throw new Error(`arg ${arg}.root is exist`);
        Args[arg] = reactive({
            el,
            list: toRef(binding, "value"),
            drag: {
                on: false,
                from_idx: null,
                to_idx: null,
                from_doms: null,
                from_$event: null,
                from_scroll: null,
            },
        });
    }

    if (binding.modifiers.scroll) {
        const arg = binding.arg;
        if (!arg) throw new Error(`arg ${arg}.scroll is required`);
        if (Scrolls[arg]) throw new Error(`arg ${arg}.scroll is exist`);
        Scrolls[arg] = {
            el,
            drag: {
                from_scroll: null,
            },
        };
    }

    if (binding.modifiers.target) {
        el.onmousedown = (e: any) => {
            // 鼠标左键
            if (e.button !== 0) return;
            const arg = binding.arg;
            if (!arg) throw new Error(`arg ${arg}.target is required`);
            if (!Args[arg]) throw new Error(`arg ${arg}.root is not exist`);
            if (Args[arg].drag.on) return;
            Args[arg].drag.on = true;
            Args[arg].drag.from_$event = e;
            Args[arg].drag.from_idx = Args[arg].list.indexOf(binding.value);
            Args[arg].drag.to_idx = Args[arg].list.indexOf(binding.value);
            Args[arg].drag.from_doms = Array.from(Args[arg].el.children).map(
                (item: any) => item.getBoundingClientRect()
            );
            Args[arg].drag.from_scroll =
                Args[arg].el.getBoundingClientRect().top -
                Args[arg].el.scrollTop;

            // 插入zindex置顶类
            // 修改全局CSS样式
            const styleElement = document.createElement("style");
            styleElement.innerHTML = `
                    .directives-useSort-zindex-${arg} {
                        z-index: 99999999 !important;
                        /* opacity: 0 !important;*/
                    }
                `;
            document.head.appendChild(styleElement);

            // console.log(Args[arg].el.children, Args[arg].drag.from_idx);

            const ele_zindex: HTMLElement = Array.from(Args[arg].el.children)[
                Args[arg].drag.from_idx
            ] as HTMLElement;
            ele_zindex.classList.add(`directives-useSort-zindex-${arg}`);

            const moveFn = (e: any) => {
                requestAnimationFrame(() => {
                    const idx = Args[arg].drag.from_idx;
                    const doms = Args[arg].drag.from_doms;
                    // const toT = e.clientY - Args[arg].drag.from_scroll;
                    const toT =
                        e.clientY -
                        Args[arg].el.getBoundingClientRect().top +
                        Args[arg].el.scrollTop;
                    // const toT = e.clientY;
                    const fromT =
                        Args[arg].drag.from_$event.clientY -
                        Args[arg].drag.from_scroll;
                    // const fromT = Args[arg].drag.from_$event.clientY;
                    const deltaY = toT - fromT;

                    const direct =
                        (-deltaY ^ (doms[idx].top - doms[0].top)) >= 0;
                    

                    if (direct) {
                        for (let i = idx - 1; i >= 0; i--) {
                            if (
                                Math.abs(deltaY) <
                                Math.abs(
                                    (doms[i].top + doms[i + 1].top) / 2 -
                                        doms[idx].top
                                )
                            ) {
                                if (i + 1 == Args[arg].drag.to_idx) break;

                                // if(Scrolls[arg]){
                                //     Scrolls[arg].drag.from_scroll = Scrolls[arg].el.scrollTop;
                                //     console.log(Scrolls[arg].drag.from_scroll);

                                // }

                                const item = Args[arg].list.splice(
                                    Args[arg].drag.to_idx,
                                    1
                                )[0];
                                Args[arg].list.splice(i + 1, 0, item);

                                // requestAnimationFrame(() => {
                                //     if(Scrolls[arg]){
                                //         Scrolls[arg].el.scrollTop = Scrolls[arg].drag.from_scroll;
                                //         console.log(Scrolls[arg].el.scrollTop);
                                //     }
                                // })

                                Args[arg].drag.to_idx = i + 1;
                                break;
                            } else if (i == 0 && Args[arg].drag.to_idx != i) {
                                const item = Args[arg].list.splice(
                                    Args[arg].drag.to_idx,
                                    1
                                )[0];
                                Args[arg].list.splice(i, 0, item);
                                Args[arg].drag.to_idx = i;
                                break;
                            }
                        }
                    } else {
                        for (let i = idx + 1; i < doms.length; i++) {
                            if (
                                Math.abs(deltaY) <
                                Math.abs(
                                    (doms[i].bottom + doms[i - 1].bottom) / 2 -
                                        doms[idx].bottom
                                )
                            ) {
                                if (i - 1 == Args[arg].drag.to_idx) break;
                                const item = Args[arg].list.splice(
                                    Args[arg].drag.to_idx,
                                    1
                                )[0];
                                Args[arg].list.splice(i - 1, 0, item);
                                Args[arg].drag.to_idx = i - 1;
                                break;
                            } else if (
                                i == doms.length - 1 &&
                                Args[arg].drag.to_idx != i
                            ) {
                                const item = Args[arg].list.splice(
                                    Args[arg].drag.to_idx,
                                    1
                                )[0];
                                Args[arg].list.splice(i, 0, item);
                                Args[arg].drag.to_idx = i;
                                break;
                            }
                        }
                    }
                });
            };
            const upFn = (e: any) => {
                Args[arg].drag.on = false;
                window.removeEventListener("mousemove", moveFn);
                window.removeEventListener("mouseup", upFn);

                // 移除 .${arg}-zindex-dragSort
                ele_zindex.classList.remove(`directives-useSort-zindex-${arg}`);
                // 移除styleElement
                document.head.removeChild(styleElement);
            };
            window.addEventListener("mousemove", moveFn);
            window.addEventListener("mouseup", upFn);
        };
    }
};
