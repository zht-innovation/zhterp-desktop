// 使用时候传入ref或func用于获取hovered状态
// eg: v-hover="toRef(object, 'hovered)"
// eg: v-hover="v=>object.hovered=v"
// eg: v-hover="v=>hovered=v" [hovered = ref()]

let mouseEvent: MouseEvent | null = null;
let bind = false;
let targetMap = new WeakMap();

const updateHoverd = (el, hovered) => {
    if (!targetMap.has(el)) return;
    const v = targetMap.get(el);
    if (typeof v === "function") {
        // func
        v(hovered);
    } else if (typeof v === "object") {
        // ref
        v.value = hovered;
    }
};

export default (el, binding) => {
    if (targetMap.get(el)) {
        targetMap.set(el, binding.value);
        return;
    }
    targetMap.set(el, binding.value);
    if (!bind) {
        // 监听window的mousemove事件，获取鼠标位置，只绑定一次
        bind = true;
        window.addEventListener(
            "mousemove",
            (e) => {
                mouseEvent = e;
            },
            true
        );
    }
    const windowFn = () => {
        if (!el.isConnected) {
            if (targetMap.has(el)) {
                updateHoverd(el, false);
            }
            window.removeEventListener("scroll", windowFn, true);
            window.removeEventListener("resize", windowFn);
            window.removeEventListener("mousemove", windowFn, true);
            targetMap.delete(el);
            return;
        }
        if (!mouseEvent) {
            return;
        }
        const elTop = document.elementFromPoint(
            mouseEvent.clientX,
            mouseEvent.clientY
        );
        if (!el.contains(elTop)) {
            updateHoverd(el, false);
        } else {
            updateHoverd(el, true);
        }
    };

    el.addEventListener("mouseenter", (e: MouseEvent) => {
        updateHoverd(el, true);
    });
    el.addEventListener("mouseleave", (e: MouseEvent) => {
        updateHoverd(el, false);
    });
    window.addEventListener("scroll", windowFn, true);
    window.addEventListener("resize", windowFn);
    window.addEventListener("mousemove", windowFn, true);
    // 防止内存泄漏， windowFn可能执行不到
    let timer = setInterval(() => {
        windowFn();
        if (!el.isConnected) {
            clearInterval(timer);
        }
    }, 500);
};
