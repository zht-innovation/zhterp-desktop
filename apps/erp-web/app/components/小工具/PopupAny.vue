<template>
    <teleport to="body">
        <transition name="bili">
            <div v-if="ox || model" :class="{
                Mask: 1,
                shake: doAni
            }" @click="nomaskback ? 0 : closeFn()">
                <div :class="{
                    HoverPop: 1,
                    shake: doAni
                }" :style="{ padding: nopadding ? '0px' : '.667rem', transform: `translate(${translateX || '-50%'}, -50%)` }" @click.stop>
                    <slot :translateX="edit_translateX"></slot>
                    <Icon name="lucide:x" class="escbtn icon-x" v-if="escbtn" @click="closeFn" />
                </div>
            </div>
        </transition>
    </teleport>
</template>

<script setup lang="ts">
let props = defineProps(["ox", "nopadding", "blur", "escbtn","nomaskback", "mask"]);
let emits = defineEmits(["keyenter", "close"]);

// 第二种使用方式v-model
let model = defineModel()

const translateX = ref('-50%')
const edit_translateX = (x: string) => {
    translateX.value = x
}

const doAni = ref(false)

const closeFn = () => {
    model.value = false;
    emits("close");
}

const keyFn = (e) => {
    if (e.key == "Enter") {
        emits("keyenter")
    }
}

onMounted(() => {
    watchEffect(() => {
        translateX.value = ''
        if (props.ox || model.value) {
            document.addEventListener("keydown", keyFn)
        } else {
            doAni.value = false;
            document.removeEventListener("keydown", keyFn)

        }
    })
})
</script>


<style scoped>
.Mask {
    z-index: 999;
    position: fixed;
    top: 0;
    left: 0;
    height: 100vh;
    width: 100vw;
    background-color: rgba(0,0,0,0.2);
    background-color: v-bind("`rgba(0,0,0,${mask})`");
    transition: .3s;
    backdrop-filter: blur(v-bind("blur ? '10px' : '0px'"));
    backdrop-filter: blur(v-bind("`${blur}px`"));
}


.HoverPop {
    position: absolute;
    top: 50%;
    left: 50%;
    z-index: 100;
    border-radius: 12px;
    /* box-shadow: 0 0 20px rgba(0, 0, 0, .16); */
    filter: drop-shadow(0 0 20px rgba(0, 0, 0, .16));
    background-color: white;
    transition: .3s;
    /* transform: translate(v-bind("translateX || '-50%'"), -50%); */
    transform: translate( -50%,  -50%);
}

.HoverPop.shake {
    animation: shake 0.22s linear;
}

.escbtn {
    position: absolute;
    top: 6px;
    right: 6px;
    z-index: 999999999;
    font-size: 16px;
    border-radius: 10px;
    padding: 16px;
    display: flex;
    /* background-color: red; */
    color: #3daa8d;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    transition: .3s;
}
.escbtn:hover{
    background-color: #eeeeee;

}
@keyframes scale-in-ease {
    0% {
        transform: translate(-50%, -50%) scale(0);
    }

    50% {
        transform: translate(-50%, -50%) scale(1.1);
    }

    100% {
        transform: translate(-50%, -50%) scale(1);
    }

}

.bili-enter-from,
.bili-leave-to {
    opacity: 0;
}

.bili-enter-active .HoverPop {
    animation: scale-in-ease cubic-bezier(0.22, 0.58, 0.12, 0.98) 0.34s;
}

.bili-leave-active .HoverPop {
    transform: translate(-50%, -50%) scale(0);
    opacity: .4;
}

@keyframes shake {
    25% {
        transform: translate(calc(10px - 50%), -50%);
    }

    50% {
        transform: translate(calc(-10px - 50%), -50%);
    }

    75% {
        transform: translate(calc(10px - 50%), -50%);
    }

    100% {
        transform: translate(-50%, -50%);
    }
}

@keyframes star {
    50% {
        background-color: rgba(255, 255, 255, 0.45);
    }

    100% {
        background-color: unset;
    }
}
</style>
