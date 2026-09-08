import time
import os
import shutil
import glob
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

# ==========================================
# CONFIGURAÇÕES
# ==========================================
ARQUIVO_CHAVES = "chaves.txt"  # Arquivo com as chaves de acesso (uma por linha)
PASTA_DOWNLOAD = os.path.join(os.path.expanduser("~"), "Desktop", "notas")

# Cria a pasta de download se não existir
if not os.path.exists(PASTA_DOWNLOAD):
    os.makedirs(PASTA_DOWNLOAD)

# Configura o navegador para fazer o download na nossa pasta
options = webdriver.ChromeOptions()
prefs = {
    "download.default_directory": PASTA_DOWNLOAD,
    "download.prompt_for_download": False,
    "directory_upgrade": True,
    "safebrowsing.enabled": True
}
options.add_experimental_option("prefs", prefs)

# Opcional: Se der erro de detecção, use a biblioteca 'undetected_chromedriver' em vez de webdriver padrão.
print("🚀 Iniciando o navegador...")
driver = webdriver.Chrome(options=options)
driver.maximize_window()

def resolver_captcha_manualmente():
    print("⚠️ Captcha ou proteção detectada! Por favor, resolva manualmente no navegador.")
    print("O script vai aguardar até que você passe pela verificação...")
    # Aguarda até que o campo de chave esteja visível novamente ou a página avance
    time.sleep(15) 

try:
    with open(ARQUIVO_CHAVES, "r") as f:
        chaves = [linha.strip() for linha in f if linha.strip()]
        
    print(f"📦 {len(chaves)} chaves carregadas do arquivo.")

    for i, chave in enumerate(chaves):
        print(f"\n[{i+1}/{len(chaves)}] Processando chave: {chave}")
        driver.get("https://www.fsist.com.br/")
        
        # 1. Digitar a chave
        try:
            input_chave = WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.ID, "chave"))
            )
            input_chave.clear()
            input_chave.send_keys(chave)
        except Exception:
            resolver_captcha_manualmente()
            # Tenta de novo após o usuário resolver
            input_chave = driver.find_element(By.ID, "chave")
            input_chave.clear()
            input_chave.send_keys(chave)

        # 2. Clicar em Consultar
        btn_consultar = driver.find_element(By.ID, "butconsulta")
        btn_consultar.click()
        
        # 3. Aguardar o botão de Download do XML aparecer
        try:
            print("Aguardando carregamento da nota...")
            btn_download = WebDriverWait(driver, 15).until(
                EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Baixar XML')] | //a[contains(@class, 'btn') and contains(@href, 'download')]"))
            )
            # Como a interface do FSist muda, esse XPATH pega botões comuns de download deles.
            # Alternativa: verificar id "baixarxml" se existir
            
            # Conta arquivos antes do clique
            arquivos_antes = len(glob.glob(os.path.join(PASTA_DOWNLOAD, "*.xml")))
            
            # Clica no download
            btn_download.click()
            
            # Espera o arquivo ser baixado (monitorando a pasta)
            tentativas = 0
            while len(glob.glob(os.path.join(PASTA_DOWNLOAD, "*.xml"))) == arquivos_antes and tentativas < 10:
                time.sleep(1)
                tentativas += 1
                
            print("✅ XML Baixado!")
            
        except Exception as e:
            print("❌ Erro ao tentar encontrar o botão de baixar XML (Pode ser Captcha, nota não encontrada ou erro no FSist).")
            print("Pausando 10 segundos para você avaliar a tela...")
            time.sleep(10)
            
        # Pausa para simular comportamento humano e evitar bloqueio
        print("⏳ Aguardando 5 segundos para a próxima nota...")
        time.sleep(5)

except FileNotFoundError:
    print(f"❌ Arquivo '{ARQUIVO_CHAVES}' não encontrado. Crie o arquivo e coloque as chaves dentro.")
finally:
    print("\n🏁 Finalizado!")
    driver.quit()
