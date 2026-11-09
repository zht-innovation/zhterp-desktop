<template>
	<div class="loading-root">
		<div class="loading-circle"></div>
	</div>
</template>

<script setup lang="ts">

</script>

<style lang="less" scoped>
.center {
	position: relative;
	left: 50%;
	top: 50%;
	transform: translate(-50%, -50%);
}

.loading-root {
	width: 100%;
	height: 100%;
	display: flex;
	align-items: center;
	justify-content: center;
	.loading-circle {
		height: 7%;
		aspect-ratio: 1 / 1;
		background-color: transparent;
		border-radius: 50%;
		// .center();

		border: 2.7px solid #968a8a;
		border-left-color: #fff;
		animation: circle infinite 0.77s linear;
	}
}

@keyframes circle {
	0% {
		transform: rotate(0deg);
	}

	100% {
		transform: rotate(360deg);
	}
}
</style>