// RTE -> 富文本中的元素类型
export interface RteText {
    type: 1;
    txt: string;
    txt_en: string;
    color?: string;
    fontSize?: number;
    fontWeight?: string;
    decoration?: number;
}

export interface RteMargin {
    type: 2;
    height?: number;
}

export interface RteImage {
    type: 3;
    src?: string;
    src_en?: string;
    href?: string;
}

export interface RteVideo {
    type: 4;
    src?: string;
    source?: boolean;
    iframe?: string;
    iframe_en?: string;
}

export interface RteButton {
    type: 5;
    txt?: string;
    txt_en?: string;
    color?: string;
    backgroundColor?: string;
    href?: string;
}

export interface RteCanvas {
    type: 6;
    height?: number;
    backgroundColor?: string;
    heightAuto?: boolean;
    widget: any[]; // 暂时未定义，可自由迭代
    lang?: 'all' | 'zh' | 'en'; // 显示语言：all=中英文都显示，zh=仅中文，en=仅英文
}

export type RteFrameItem =
    | RteText
    | RteMargin
    | RteImage
    | RteVideo
    | RteButton
    | RteCanvas;

export type RteFrame = RteFrameItem[];

// RTE -> 编辑器中的元素类型

// #region 基础单位小组件：BaseComponent
export type BaseComponent =
    | {
          type: "text";
          name?: string; //BaseComponent的name属性用于contentList中的小标题
          textarea?: boolean; // 是否开启textarea多行文本输入
          zh: (json: any) => any;
          en: (json: any) => any;
      }
    | {
          type: "txt"; // 只有一个input框，不分中英文
          name?: string;
          placeholder?: string;
          //   default?: string;
          txt: (json: any) => any;
      }
    | {
          type: "number";
          name?: string;
          number: (json: any) => any;
      }
    | {
          type: "switch";
          name?: string;
          switch: (json: any) => any;
          True?: string;
          False?: string;
      }
    | {
          type: "time";
          name?: string;
          timestamp: (json: any) => any;
      }
    | {
          type: "color";
          name?: string;
          color: (json: any) => any;
      }
    | {
          type: "image";
          name?: string;
          image: (json: any) => any;
      }
    | {
          type: "image_lang";
          name?: string;
          zh: (json: any) => any;
          en: (json: any) => any;
      }
    | {
          type: "file"; //
          name?: string;
          accept?: string;
          uploader?: (formData: FormData) => Promise<any>;
          file: (json: any) => any;
      }
    | {
          type: "rte";
          name?: string;
          rte: (json: any) => any;
      }
    | {
          type: "list";
          name?: string;
          list: (json: any) => any;
          attr_eles: BaseComponent[];
      }
    | {
          type: "config_selector";
          name?: string;
          rule: "id" | "slug" | "path";
          column: {
              id: (indice: any) => any;
              title: (indice: any) => string;
              hasTree: "path" | "tag"; // 是否有文件目录, 根据path分类
          };
          selector: (json: any) => any;
          getIndex_api: () => any; // 获取索引的api
          index_file_type?: "article" | "picture" | "product"; // 索引文件类型用于缓存localstorage

      };
// #endregion

// #region 不是单纯绑定数值功能的特殊组件
export type SpecialComponent =
    | {
          type: "tags"; // 标签设置组件
          name?: string;
          tags: (json: any) => any;
      }
    | {
          type: "path"; // 路径节点组件
          name?: string;
          path: (json: any) => any;
      }
    | {
          type: "filter"; // 路径节点组件
          name?: string;
          filter: (json: any) => any;
      }
    | {
          type: "readJsonData"; // 读取json文件数据进行复制覆盖
          rule?: string; // json覆盖规则
      }
    | {
          type: "urlRename"; // 网址重命名组件
          name?: string;
          getIndex_api: () => any; // 获取索引的api
          urlRename: (json: LocalStorageOthOpt['UrlRename']) => any;
      }
    | {
          type: "urlRenameItem"; // 网址重命名组件
          name?: string;
          kind: "article" | "picture" | "product";
      };
// #endregion

// 配置项article picture product的类型声明
export interface ConfigList {
    type: "ConfigList"; // 类型
    path: string; // 用于设置路由的path
    title: string;
    permission: number; // 访问权限限制, <= 这个数字的角色可以访问
    allowRoles?: number[]; // 额外允许访问的特定角色
    api: {
        // 后端接口
        list: Function; // 获取全部索引列表
        getFile: (slug: string) => any; // 获取单个文件信息
        upload: (id: string, data: any) => any; // 上传文件：可新增and更改
        delete: (id: string) => any; // 删除文件
    };
    column: {
        // 列表组件的配置，从api.list的索引中获取，indice代表从后端拿到的索引对象
        id: (indice: any) => any; // 通过column组件拿到的json文件的id
        title: (indice: any) => string; // column组件显示的title
        hasTree?: "path" | "tag"; // 是否有文件目录, 根据path分类
    };
    content: {
        title?: string; // 表单元素标题
        ele: BaseComponent | SpecialComponent; // 表单元素
    }[]; // 表单元素
}

// 其他配置项 包括 资源管理，轮播图等 零碎配置 的类型声明
export interface ConfigItem {
    type: "ConfigItem"; // 类型
    path: string; // 用于设置路由的path
    title: string;
    permission: number; // 访问权限限制, <= 这个数字的角色可以访问
    allowRoles?: number[]; // 额外允许访问的特定角色
    list: {
        id: string;
        title: string;
        api: {
            getFile: (name: string) => any;
            upload: (name: File) => any;
        };
        content: {
            title?: string;
            ele: BaseComponent | SpecialComponent;
        }[];
    }[];
}

// 类似于留言管理页面，功能仅为展示一些信息，而不需要新增/修改/删除等复杂操作
export interface DisplayConfig<E extends Record<string, number>> {
    type: "DisplayConfig";
    path: string; // 用于设置路由的path
    title: string;
    permission: number; // 访问权限限制, <= 这个数字的角色可以访问
    allowRoles?: number[]; // 额外允许访问的特定角色
    column: Array<string>; // 展示栏需要呈现哪些列
    field: Array<string>; // 展示栏对应的数据字段
    tags: Array<
        {
            field: string, 
            enums: E,
            name: Record<number, string>,
            color: Array<string>,
        }
    >; // 作为tag展示的字段
    clipboard: Array<string>; // 需要点击复制的字段
    detail: Array<string>; // 需要弹窗详细展示的字段
}

export interface SalesConfig {
    type: "SalesConfig"
    path: string; // 用于设置路由的path
    title: string;
    permission: number; // 访问权限限制, <= 这个数字的角色可以访问
    allowRoles?: number[]; // 额外允许访问的特定角色
}
// 默认空白模板配置用这个
export interface DefaultConfig {
    type: "DefaultConfig"
    path: string; // 用于设置路由的path
    title: string;
    permission: number; // 访问权限限制, <= 这个数字的角色可以访问
    allowRoles?: number[]; // 额外允许访问的特定角色
}

// localStorage[config_editor]
export interface LocalStorageEditor {
    margin: {
        height: number;
        img2img_height: number;
        img2video_height: number;
        video2video_height: number;
    };
    // text样式组
    textStyleGroup: {
        id: number; // 唯一标识用于换续
        name: string;
        color: string;
        fontSize: number;
        fontWeight: string;
        decoration: number;
    }[];
    textStyle: {
        color: string;
        fontSize: number;
        fontWeight: string;
        decoration: number;
    };
}
// localStorage[config_info]
export interface LocalStorageConfigInfo {
    version?: string; // 编辑器版本号
    UI_gen2?: boolean; // UI第二代开关
}
// 其他配置信息[other_option]
export interface LocalStorageOthOpt {
    CompanyBrochure?: {
        zh?: string;
        en?: string;
    };
    mainCarousel?: any[];
    AccessoriesCard?: any[];
    DroneSystem?: {
        cards: any[];
    };
    DroneFrame?: {
        cards: any[];
    };
    indexData?: {
        article: any[];
    };
    Introduction?: {
        banner_tit?: string;
        banner_tit_en?: string;
        banner_img?: string;
        list1?: {
            tit?: string;
            tit_en?: string;
            desc?: string;
            desc_en?: string;
            img?: string;
        }[];
        center1?: string;
        center1_en?: string;
        title1?: string;
        title1_en?: string;
        list2?: {
            img?: string;
            tit?: string;
            tit_en?: string;
        }[];
        title2?: string;
        title2_en?: string;
        honorPic?: string;
        title3?: string;
        title3_en?: string;
        tit3?: string;
        tit3_en?: string;
        list3?: {
            img?: string;
            id?: string;
        }[];
        list4?: {
            desc?: string;
            desc_en?: string;
            img?: string;
            tit?: string;
            tit_en?: string;
        }[];
        list5?: {
            tit?: string;
            tit_en?: string;
            desc?: string;
            desc_en?: string;
            img_left?: string;
            img_right?: string;
        }[];
        tail?: string;
        tail_en?: string;
    };
    UrlRename?: {
        article?: {[key: string]: string};
        picture?: {[key: string]: string};
        product?: {[key: string]: string};
    }
}
export interface LocalStorageIndexFile {
    article?: any[];
    picture?: any[];
    product?: any[];
}
export interface SesstionStorageOthOpt {}
