# Save Token Kit (stk) 开发命令
# 常用任务包装为 make 目标，底层使用 pnpm。

.PHONY: install build test cover lint format clean install-local

install: ## 安装依赖
	pnpm install

install-local: build ## 本地编译并全局链接 stk 命令（npm link）
	npm link

build: ## 构建 ESM 产物到 dist/
	pnpm build

test: ## 运行全部测试
	pnpm test

cover: ## 测试并生成覆盖率报告 (阈值 60%)
	pnpm coverage

lint: ## ESLint 检查
	pnpm lint

format: ## Prettier 格式化
	pnpm format

clean: ## 清理构建与覆盖率产物
	rm -rf dist coverage save-token
