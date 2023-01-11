// This file is generated automatically, do not edit!
export const embeddedFiles = {
  "src/github/workflows/cndi-run.yaml":
    "name: cndi\non:\n  push:\n    branches:\n      - main\n      - 'releases/**'\njobs:\n  cndi-run:\n    runs-on: ubuntu-20.04\n    steps:\n      - name: welcome\n        run: echo \"welcome to cndi!\"\n\n      - name: checkout state\n        uses: actions/checkout@v3\n        continue-on-error: true # first run has no state branch\n        with:\n          fetch-depth: 0\n          ref: '_state'\n\n      - name: save state\n        run: mv ./terraform.tfstate.gpg ~/terraform.tfstate.gpg\n        continue-on-error: true # first run has no state\n      \n      - name: echo state\n        run: stat ~/terraform.tfstate.gpg\n        continue-on-error: true # first run has no state\n\n      - name: checkout repo\n        uses: actions/checkout@v2\n        with:\n          fetch-depth: 0\n\n      - name: decrypt terraform state\n        run: gpg --batch --passphrase ${{ secrets.TERRAFORM_STATE_PASSPHRASE }} -d ~/terraform.tfstate.gpg > cndi/terraform/terraform.tfstate\n        continue-on-error: true # if we try to encrypt a non-existent tfstate file, that's fine\n\n      - name: show decrypted state\n        run: cat cndi/terraform/terraform.tfstate\n\n      - name: setup cndi\n        uses: polyseam/setup-cndi@1.0.3\n        with:\n          version: main\n\n      - name: cndi chmod\n        run: chmod +x bin/cndi # make cndi cli executable\n\n      - name: cndi install\n        run: bin/cndi install # run 'cndi install'\n\n      # this next step is the core of the workflow\n      - name: cndi run\n        env:\n          GIT_REPO:  https://github.com/${{ github.repository}}\n          GIT_USERNAME: ${{ secrets.GIT_USERNAME }}\n          GIT_PASSWORD: ${{ secrets.GIT_PASSWORD }}\n          ARGO_UI_READONLY_PASSWORD: ${{ secrets.ARGO_UI_READONLY_PASSWORD }}\n          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}\n          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}\n          AWS_REGION: ${{ secrets.AWS_REGION }}\n          GOOGLE_CREDENTIALS: ${{ secrets.GOOGLE_CREDENTIALS }}\n          SEALED_SECRETS_PRIVATE_KEY_MATERIAL: ${{ secrets.SEALED_SECRETS_PRIVATE_KEY_MATERIAL }}\n          SEALED_SECRETS_PUBLIC_KEY_MATERIAL: ${{ secrets.SEALED_SECRETS_PUBLIC_KEY_MATERIAL }}\n        run: bin/cndi run  # run 'cndi run'\n\n      - name: move state out of repo\n        run: mv cndi/terraform/terraform.tfstate ~/\n      \n      - name: encrypt terraform state\n        run: gpg --symmetric --batch --yes --passphrase ${{ secrets.TERRAFORM_STATE_PASSPHRASE }}  ~/terraform.tfstate\n\n      - name: remove repo contents\n        run: git rm -r .\n\n      - name: assess damages\n        run: git status\n\n      - name: copy encrypted state back into repo\n        run: 'mv ~/terraform.tfstate.gpg .'\n\n      - name: persist terraform state\n        uses: EndBug/add-and-commit@v9\n        with:\n          new_branch: _state\n          push: origin _state --set-upstream --force\n          add: terraform.tfstate.gpg\n          commiter_name: CNDI Bot\n\n      - name: report terraform failure if necessary\n        run: |\n          if [[ -f ./apply-did-fail ]] ; then\n              echo terraform apply failed.\n              echo for more info see the \\\"cndi run\\\" step output above\n              exit 1\n          fi",
  "./deno.jsonc":
    '{\n  "version": "1.0.0",\n  "tasks": {\n    "stringUp": "deno run -A --unstable src/installer/doStringUp.ts",\n    "compile-win": "deno compile --unstable -A --target x86_64-pc-windows-msvc --output dist/cndi-win.exe main.ts",\n    "compile-linux": "deno compile --unstable -A --target x86_64-unknown-linux-gnu --output dist/cndi-linux main.ts",\n    "compile-mac": "deno compile --unstable -A --target x86_64-apple-darwin --output dist/cndi-mac main.ts",\n    "compile-all": "deno task compile-win && deno task compile-linux && deno task compile-mac",\n    "build": "deno task stringUp && deno fmt && deno task compile-all",\n    "test": "deno test --unstable --allow-all --coverage=coverage"\n  }\n}\n',
};
