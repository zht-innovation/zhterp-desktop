<template>
    <div class="ContentSwitch">
        <span :class="{ active: !model }">{{ False }}</span>
        <el-switch v-model="model" size="large" :style="{
            '--el-switch-on-color': color
        }"></el-switch>
        <span :class="{ active: model }">{{ True }}</span>
    </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted,  } from 'vue'

const model = defineModel<boolean>()

const { color = '#4cceac', scale = 1} = defineProps<{
    True?: string;
    False?: string;
    color?: string;
    scale?: number;
}>()


</script>

<style scoped>
.ContentSwitch{
    flex: 1;
    width: 100%;
    font-size: 19px;
    display: flex;
    align-items: center;
    gap: 10px;
    color: #959595;
    transform: scale(v-bind("scale"));
}
.active{
    color: v-bind("color");
    font-weight: bold;
}

</style>