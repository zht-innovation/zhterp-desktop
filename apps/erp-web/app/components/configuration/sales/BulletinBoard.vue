<template>
	<div class="bulletin-board">
		<div class="bulletin-header">
			<div class="header-left">
				<Icon name="mdi:bullhorn-outline" class="bulletin-icon" />
				<span class="title">系统公告</span>
			</div>
			<el-button text class="toggle-btn" type="primary" @click="dialogVisible = true">
				查看全部
				<Icon name="mdi:chevron-right" />
			</el-button>
		</div>

		<div class="bulletin-marquee">
			<div class="marquee-track">
				<div class="marquee-content">
					<span v-for="update in latestUpdates" :key="update.id" class="marquee-item">
						<el-tag :type="getTagType(update.type)" size="small">{{ getTypeLabel(update.type) }}</el-tag>
						<span class="update-title">{{ update.title }}</span>
						<span class="update-date">{{ update.date }}</span>
					</span>
				</div>
			</div>
		</div>

		<!-- 弹窗 -->
		<el-dialog
			v-model="dialogVisible"
			title="系统公告"
			width="600px"
			:close-on-click-modal="true"
		>
			<el-scrollbar class="bulletin-list">
				<div v-for="update in latestUpdates" :key="update.id" class="bulletin-item">
					<div class="item-header">
						<el-tag :type="getTagType(update.type)" size="small">{{ getTypeLabel(update.type) }}</el-tag>
						<span class="version">{{ update.version }}</span>
						<span class="date">{{ update.date }}</span>
					</div>
					<div class="item-title">{{ update.title }}</div>
					<div class="item-content">{{ update.content }}</div>
				</div>
			</el-scrollbar>
		</el-dialog>
	</div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { getLatestUpdates, type BulletinUpdate } from '~/utils/bulletinUpdates'

const dialogVisible = ref(false)
const latestUpdates = ref<BulletinUpdate[]>(getLatestUpdates(4))

const getTagType = (type: string) => {
	const typeMap: Record<string, string> = {
		feature: 'success',
		fix: 'danger',
		improvement: 'warning',
		notice: 'info'
	}
	return typeMap[type] || 'info'
}

const getTypeLabel = (type: string) => {
	const labelMap: Record<string, string> = {
		feature: '新功能',
		fix: '修复',
		improvement: '优化',
		notice: '通知'
	}
	return labelMap[type] || '通知'
}
</script>

<style lang="less" scoped>
.bulletin-board {
	background: #fff;
	border-radius: 12px;
	padding: 8px 20px;
	margin-bottom: 12px;	
	color: #000;
}

.bulletin-header {
	display: flex;
	justify-content: space-between;
	align-items: center;

	.header-left {
		display: flex;
		align-items: center;
		gap: 8px;

		.bulletin-icon {
			font-size: 20px;
		}

		.title {
			font-size: 16px;
			font-weight: 600;
		}
	}

	.toggle-btn {
		font-size: 14px;
		color: #fff;
		background-color: #3f8cff;
		border-radius: 10px;

		&:hover {
			background-color: #367ce6;
			color: #fff;
		}
	}
}

.bulletin-marquee {
	overflow: hidden;
	margin-top: 8px;
	position: relative;

	.marquee-track {
		width: 100%;
		overflow: hidden;
	}

	.marquee-content {
		display: inline-flex;
		gap: 60px;
		padding-left: 100%;
		animation: marquee-scroll 20s linear infinite;
		white-space: nowrap;

		&:hover {
			animation-play-state: paused;
		}
	}

	.marquee-item {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		white-space: nowrap;
		flex-shrink: 0;

		.update-title {
			font-size: 14px;
		}

		.update-date {
			font-size: 12px;
			opacity: 0.8;
		}
	}
}

@keyframes marquee-scroll {
	0% {
		transform: translateX(0);
	}

	100% {
		transform: translateX(-100%);
	}
}

.bulletin-list {
	display: flex;
	flex-direction: column;
	max-height: 400px;
	overflow-y: auto;

	.bulletin-item {
		background: #f5f7fa;
		border-radius: 8px;
		padding: 15px;
		margin-top: 7px;

		.item-header {
			display: flex;
			align-items: center;
			gap: 10px;
			margin-bottom: 10px;

			.version {
				font-size: 13px;
				color: #606266;
				font-weight: 500;
			}

			.date {
				font-size: 12px;
				color: #909399;
				margin-left: auto;
			}
		}

		.item-title {
			font-size: 15px;
			font-weight: 600;
			color: #303133;
			margin-bottom: 8px;
		}

		.item-content {
			font-size: 14px;
			color: #606266;
			line-height: 1.6;
		}
	}
}
</style>
