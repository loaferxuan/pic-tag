#!/bin/bash
# Android 构建脚本
# 支持 EAS Build 和本地预构建方式

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}====================================${NC}"
echo -e "${GREEN}   PicTag Android 构建脚本${NC}"
echo -e "${GREEN}====================================${NC}"
echo ""

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# 检查 node_modules
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}正在安装依赖...${NC}"
    npm install
fi

# 解析参数
BUILD_TYPE=${1:-eas}

case $BUILD_TYPE in
    eas)
        echo -e "${GREEN}使用 EAS Build 方式构建...${NC}"
        echo ""
        echo -e "${YELLOW}可用的构建配置:${NC}"
        echo "  1. release-apk-arm64   - ARM64 APK (推荐)"
        echo "  2. release-apk-armv7   - ARMv7 APK"
        echo "  3. store              - 应用商店版本"
        echo ""
        read -p "请选择构建配置 [1-3，默认1]: " choice
        choice=${choice:-1}

        case $choice in
            1) PROFILE="release-apk-arm64" ;;
            2) PROFILE="release-apk-armv7" ;;
            3) PROFILE="store" ;;
            *) PROFILE="release-apk-arm64" ;;
        esac

        echo -e "${GREEN}开始 EAS Build (profile: $PROFILE)...${NC}"
        ./node_modules/.bin/eas build --platform android --profile $PROFILE
        ;;

    local)
        echo -e "${GREEN}使用本地预构建方式...${NC}"
        echo ""

        # 预构建
        echo -e "${YELLOW}步骤 1: 生成 Android 项目...${NC}"
        npx expo prebuild --platform android --clean

        # 进入 Android 目录
        cd android

        # 检查 signing
        if [ ! -f "app/release.jks" ]; then
            echo -e "${YELLOW}警告: 未找到签名文件，使用 debug 签名构建${NC}"
            echo ""
            echo -e "${YELLOW}步骤 2: 构建 Debug APK...${NC}"
            ./gradlew assembleDebug
            APK_PATH="android/app/build/outputs/apk/debug/app-debug.apk"
        else
            echo ""
            echo -e "${YELLOW}步骤 2: 构建 Release APK...${NC}"
            ./gradlew assembleRelease
            APK_PATH="android/app/build/outputs/apk/release/app-release.apk"
        fi

        echo ""
        echo -e "${GREEN}====================================${NC}"
        echo -e "${GREEN}构建完成！${NC}"
        echo -e "${GREEN}APK 路径: $APK_PATH${NC}"
        echo -e "${GREEN}====================================${NC}"
        ;;

    eas-local)
        echo -e "${GREEN}使用 EAS Local Build...${NC}"
        npm install -g eas-build-local
        eas build:local --platform android --profile release-apk-arm64
        ;;

    *)
        echo -e "${RED}未知构建类型: $BUILD_TYPE${NC}"
        echo "用法: ./build-android.sh [eas|local|eas-local]"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}脚本执行完成！${NC}"
