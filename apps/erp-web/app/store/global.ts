import { defineStore } from 'pinia'

export const useGlobalStore = defineStore('global', {
    state: () => ({
        isLoaded: false,
        isZh: false,
        isSafari: false,
        scrollDirct: 'down',
        RAW_INDEX: {
            article: [],
            picture: [],
            product: [],
        },
        INDEX: {
            article: {},
            picture: {},
            product: {},
        },
        otherOptions: {
            AccessoriesCard: [],
            DroneSystem: { cards: [] },
            DroneFrame: { cards: [] },
        },
        // 用于触发滚动的状态
        scrollToTopSignal: 0,
        scrollToTop: false,
        isInstantToTop: false,
        copyToolData: null,
    }),
    actions: {
        setAll(           
            art: any[],
            pic: any[],
            pro: any[],
            acc: any[],
            ds: any[],
            df: any[],
        ) {
            this.RAW_INDEX.article = art
            this.RAW_INDEX.picture = pic
            this.RAW_INDEX.product = pro
            this.INDEX.article = this.reduceToIndex(art)
            this.INDEX.picture = this.reduceToIndex(pic)
            this.INDEX.product = this.reduceToIndex(pro)

            this.otherOptions.AccessoriesCard = acc.cards || []
            this.otherOptions.DroneSystem.cards = ds.cards || []
            this.otherOptions.DroneFrame.cards = df.cards || []
        },

        setArt(art: any[]) {
            this.RAW_INDEX.article = art
            this.INDEX.article = this.reduceToIndex(art)
        },
        setPic(pic: any[]) {
            this.RAW_INDEX.picture = pic
            this.INDEX.picture = this.reduceToIndex(pic)
        },
        setPro(pro: any[]) {
            this.RAW_INDEX.product = pro
            this.INDEX.product = this.reduceToIndex(pro)
        },
        
        reduceToIndex(items: any[]) {
            return items.reduce((prev, cur) => {
                prev[cur._id] = cur
                return prev
            }, {})
        },
        // Action 来触发滚动
        triggerScrollToTop(state) {
            this.scrollToTop = !this.scrollToTop;
            this.scrollToTopSignal++; // 简单地增加数字来触发 watch
        },
        changeScrollBehavior() {
            this.isInstantToTop = !this.isInstantToTop;
        },
        setCopyToolData(data: any) {
            this.copyToolData = data;
        },
    },
})