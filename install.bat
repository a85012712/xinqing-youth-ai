@echo off
chcp 65001 >/dev/null

echo 🌈 心晴少年AI - 安装程序
echo ========================
echo.

REM 检查Node.js
node -v >/dev/null 2>&1
if %errorlevel% neq 0 (
    echo ❌ 未找到Node.js，请先安装Node.js 18+
    echo    下载地址: https://nodejs.org/
    pause
    exit /b 1
)

echo ✅ Node.js已安装
echo.

REM 安装依赖
echo 📦 正在安装依赖...
call npm install

if %errorlevel% neq 0 (
    echo ❌ 依赖安装失败
    pause
    exit /b 1
)

echo ✅ 依赖安装完成
echo.

REM 创建配置文件
if not exist .env (
    echo 📝 正在创建配置文件...
    copy .env.example .env
    echo ✅ 配置文件已创建
    echo.
    echo ⚠️  请编辑 .env 文件，填入你的API密钥：
    echo    LLM_API_KEY=你的API密钥
) else (
    echo ✅ 配置文件已存在
)

REM 创建数据目录
echo.
echo 📁 正在创建数据目录...
mkdir data\conversations 2>/dev/null
mkdir data\datasets 2>/dev/null
mkdir data\vectors 2>/dev/null
mkdir data\uploads 2>/dev/null
mkdir data\memory 2>/dev/null
echo ✅ 数据目录已创建

echo.
echo 🎉 安装完成！
echo.
echo 启动命令：
echo   npm start
echo.
echo 然后访问: http://localhost:3000
echo.
echo 💜 心晴少年AI - 让每一个少年都被温柔以待
echo.
pause
