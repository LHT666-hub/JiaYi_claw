import Taro from "@tarojs/taro";

export function installMiniProgramUpdateHandler() {
  if (process.env.TARO_ENV !== "weapp" || typeof Taro.getUpdateManager !== "function") return;
  const manager = Taro.getUpdateManager();
  manager.onUpdateReady(() => {
    void Taro.showModal({
      title: "新版本已准备好",
      content: "更新后可继续使用最新的家医服务。正在填写的内容请先确认已提交。",
      confirmText: "立即更新",
      cancelText: "稍后",
    }).then((result) => {
      if (result.confirm) manager.applyUpdate();
    });
  });
  manager.onUpdateFailed(() => {
    void Taro.showModal({
      title: "更新没有完成",
      content: "请检查网络后重新打开小程序。当前版本仍可继续查询服务信息。",
      showCancel: false,
      confirmText: "我知道了",
    });
  });
}
