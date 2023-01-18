// This file is generated automatically, do not edit!
export const embeddedFiles = {
  "src/github/workflows/cndi-run.yaml":
    "name: cndi\non:\n  push:\n    branches:\n      - main\n      - \"releases/**\"\njobs:\n  cndi-run:\n    runs-on: ubuntu-20.04\n    steps:\n      - name: welcome\n        run: echo \"welcome to cndi!\"\n      \n      - name: checkout repo\n        uses: actions/checkout@v3\n        with:\n          fetch-depth: 0\n\n      - name: setup cndi\n        uses: polyseam/setup-cndi@1.0.3\n        with:\n          version: main\n\n      - name: cndi chmod\n        run: chmod +x bin/cndi # make cndi cli executable\n\n      - name: cndi install\n        run: bin/cndi install # run 'cndi install'\n\n      # this next step is the core of the workflow\n      - name: cndi run\n        env:\n          # coreEnv\n          GIT_REPO:  https://github.com/${{ github.repository}}\n          GIT_USERNAME: ${{ secrets.GIT_USERNAME }}\n          GIT_PASSWORD: ${{ secrets.GIT_PASSWORD }}\n          TERRAFORM_STATE_PASSPHRASE: ${{ secrets.TERRAFORM_STATE_PASSPHRASE }}\n          SEALED_SECRETS_PRIVATE_KEY_MATERIAL: ${{ secrets.SEALED_SECRETS_PRIVATE_KEY_MATERIAL }}\n          SEALED_SECRETS_PUBLIC_KEY_MATERIAL: ${{ secrets.SEALED_SECRETS_PUBLIC_KEY_MATERIAL }}\n          ARGO_UI_READONLY_PASSWORD: ${{ secrets.ARGO_UI_READONLY_PASSWORD }}\n          # AWS\n          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}\n          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}\n          AWS_REGION: ${{ secrets.AWS_REGION }}\n          # GCP\n          GOOGLE_CREDENTIALS: ${{ secrets.GOOGLE_CREDENTIALS }}\n          # Azure Resource Manager\n          ARM_REGION: ${{ secrets.ARM_REGION }}\n          ARM_SUBSCRIPTION_ID: ${{ secrets.ARM_SUBSCRIPTION_ID }}\n          ARM_TENANT_ID: ${{ secrets.ARM_TENANT_ID }}\n          ARM_CLIENT_ID: ${{ secrets.ARM_CLIENT_ID }}\n          ARM_CLIENT_SECRET: ${{ secrets.ARM_CLIENT_SECRET }}\n        run: bin/cndi run # run 'cndi run'\n",
  "./deno.jsonc":
    '{\n  "version": "1.0.0",\n  "tasks": {\n    "stringUp": "deno run -A --unstable src/installer/doStringUp.ts",\n    "compile-win": "deno compile --unstable -A --target x86_64-pc-windows-msvc --output dist/cndi-win.exe main.ts",\n    "compile-linux": "deno compile --unstable -A --target x86_64-unknown-linux-gnu --output dist/cndi-linux main.ts",\n    "compile-mac": "deno compile --unstable -A --target x86_64-apple-darwin --output dist/cndi-mac main.ts",\n    "compile-all": "deno task compile-win && deno task compile-linux && deno task compile-mac",\n    "build": "deno task stringUp && deno fmt && deno task compile-all",\n    "test": "deno test --unstable --allow-all"\n  },\n  "importMap": "import_map.json"\n}\n',
};
