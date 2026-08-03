package com.naxio.software;

import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.animation.AlphaAnimation;
import android.view.animation.AnimationSet;
import android.view.animation.TranslateAnimation;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import android.graphics.drawable.GradientDrawable;

import androidx.appcompat.app.AppCompatActivity;

import com.getnet.posdigital.PosDigital;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

public class MainActivity extends AppCompatActivity {

    private LinearLayout mainLayout;
    private ScrollView scrollList;
    private LinearLayout listContainer;
    
    private LinearLayout loginLayout;
    private EditText emailInput;
    private EditText passInput;
    
    private LinearLayout comandasLayout;
    
    private final String SUPABASE_URL = "https://groezaseypdbpgymgpvo.supabase.co";
    private final String SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdyb2V6YXNleXBkYnBneW1ncHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNjkxNjYsImV4cCI6MjA4MTY0NTE2Nn0.5U5QeoGmZn_i9Y8POoUCkatBUAdSW-cjHRyfxpm_pyM";
    private final String API_NFCE_URL = "https://naxiosoftware.vercel.app/api/emitir_fiscal";
    
    // Variáveis de Estado da Mesa Atual
    private JSONObject currentComandaObj = null;
    private String currentComandaId = null;
    private String currentComandaNum = null;
    private double originalTotal = 0.0;
    private JSONArray currentItems = null;
    
    // Acumulador de Múltiplos Pagamentos
    private JSONArray accumulatedPayments = new JSONArray();
    private double accumulatedTotal = 0.0;
    private double accumulatedDiscount = 0.0;
    
    // Variáveis Temporárias para a Chamada Getnet
    private double pendingAmount = 0.0;
    private String pendingPaymentType = null;
    
    private SharedPreferences prefs;
    private android.app.Dialog currentDialog = null;
    private String clienteCpf = "";
    private String clienteNome = "";

    // Auto-refresh
    private final Handler autoRefreshHandler = new Handler(Looper.getMainLooper());
    private static final int AUTO_REFRESH_INTERVAL_MS = 30_000; // 30 segundos
    private Runnable autoRefreshRunnable;
    private ProgressBar loadingBar;
    private TextView tvStoreInfo;
    private EditText searchInput;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("naxio_pos", MODE_PRIVATE);

        // Auto-refresh runnable
        autoRefreshRunnable = () -> {
            if (!prefs.getString("store_id", "").isEmpty()) {
                loadComandas();
            }
            autoRefreshHandler.postDelayed(autoRefreshRunnable, AUTO_REFRESH_INTERVAL_MS);
        };

        mainLayout = new LinearLayout(this);
        mainLayout.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable mainBg = new GradientDrawable(
            GradientDrawable.Orientation.TOP_BOTTOM,
            new int[]{Color.parseColor("#0f172a"), Color.parseColor("#020617")}
        );
        mainLayout.setBackground(mainBg);
        
        setupLoginLayout();
        setupComandasLayout();

        mainLayout.addView(loginLayout);
        mainLayout.addView(comandasLayout);
        setContentView(mainLayout);

        // Init Getnet
        try {
            PosDigital.register(getApplicationContext(), new PosDigital.BindCallback() {
                @Override public void onError(Exception e) {}
                @Override public void onConnected() {}
                @Override public void onDisconnected() {}
            });
        } catch (Exception e) {}

        if (prefs.getString("store_id", "").isEmpty()) {
            showLogin();
        } else {
            showComandas();
            loadComandas();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (!prefs.getString("store_id", "").isEmpty()) {
            autoRefreshHandler.postDelayed(autoRefreshRunnable, AUTO_REFRESH_INTERVAL_MS);
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        autoRefreshHandler.removeCallbacks(autoRefreshRunnable);
    }

    private void setupLoginLayout() {
        loginLayout = new LinearLayout(this);
        loginLayout.setOrientation(LinearLayout.VERTICAL);
        loginLayout.setPadding(72, 120, 72, 60);
        loginLayout.setGravity(Gravity.CENTER_HORIZONTAL);

        // Logo / Icon
        TextView loginIcon = new TextView(this);
        loginIcon.setText("💳");
        loginIcon.setTextSize(64);
        loginIcon.setGravity(Gravity.CENTER);
        loginIcon.setPadding(0, 0, 0, 16);
        loginLayout.addView(loginIcon);
        
        TextView loginTitle = new TextView(this);
        loginTitle.setText("Naxio Enterprise POS");
        loginTitle.setTextSize(28);
        loginTitle.setTypeface(null, Typeface.BOLD);
        loginTitle.setTextColor(Color.WHITE);
        loginTitle.setGravity(Gravity.CENTER);
        loginTitle.setPadding(0, 0, 0, 12);
        loginLayout.addView(loginTitle);

        TextView loginSub = new TextView(this);
        loginSub.setText("Sistema de Ponto de Venda Getnet");
        loginSub.setTextSize(13);
        loginSub.setTextColor(Color.parseColor("#94a3b8"));
        loginSub.setGravity(Gravity.CENTER);
        loginSub.setPadding(0, 0, 0, 60);
        loginLayout.addView(loginSub);
        
        GradientDrawable inputBg = new GradientDrawable();
        inputBg.setColor(Color.parseColor("#1e293b"));
        inputBg.setCornerRadius(24);
        inputBg.setStroke(2, Color.parseColor("#334155"));

        emailInput = new EditText(this);
        emailInput.setHint("E-mail da Loja / Garçom");
        emailInput.setHintTextColor(Color.GRAY);
        emailInput.setTextColor(Color.WHITE);
        emailInput.setBackground(inputBg);
        emailInput.setPadding(40, 40, 40, 40);
        loginLayout.addView(emailInput);
        
        passInput = new EditText(this);
        passInput.setHint("Senha");
        passInput.setHintTextColor(Color.GRAY);
        passInput.setTextColor(Color.WHITE);
        passInput.setBackground(inputBg);
        passInput.setPadding(40, 40, 40, 40);
        passInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        // Ação "Pronto" no teclado -> faz login
        passInput.setImeOptions(EditorInfo.IME_ACTION_DONE);
        passInput.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_DONE) {
                performLogin();
                return true;
            }
            return false;
        });
        LinearLayout.LayoutParams passParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        passParams.setMargins(0, 30, 0, 50);
        loginLayout.addView(passInput, passParams);
        
        GradientDrawable btnBg = new GradientDrawable();
        btnBg.setColor(Color.parseColor("#3b82f6"));
        btnBg.setCornerRadius(24);

        Button btnLogin = new Button(this);
        btnLogin.setText("🚀 ENTRAR NO PDV");
        btnLogin.setBackground(btnBg);
        btnLogin.setTextColor(Color.WHITE);
        btnLogin.setPadding(0, 40, 0, 40);
        btnLogin.setElevation(8f);
        btnLogin.setOnClickListener(v -> performLogin());
        loginLayout.addView(btnLogin);

        // Botão Fale Conosco (Mandatório na certificação)
        GradientDrawable btnFaleBg = new GradientDrawable();
        btnFaleBg.setColor(Color.TRANSPARENT);
        btnFaleBg.setStroke(2, Color.parseColor("#475569"));
        btnFaleBg.setCornerRadius(24);

        Button btnFale = new Button(this);
        btnFale.setText("💬 FALE CONOSCO");
        btnFale.setBackground(btnFaleBg);
        btnFale.setTextColor(Color.parseColor("#94a3b8"));
        btnFale.setPadding(0, 30, 0, 30);
        btnFale.setElevation(2f);
        btnFale.setOnClickListener(v -> NaxioUI.showFaleConoscoDialog(this));
        
        LinearLayout.LayoutParams btnFaleParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        btnFaleParams.setMargins(0, 30, 0, 0);
        loginLayout.addView(btnFale, btnFaleParams);
    }

    private void setupComandasLayout() {
        comandasLayout = new LinearLayout(this);
        comandasLayout.setOrientation(LinearLayout.VERTICAL);
        comandasLayout.setPadding(40, 50, 40, 40);
        
        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(0, 0, 0, 20);
        
        LinearLayout titleGroup = new LinearLayout(this);
        titleGroup.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams tgLp = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1.0f);
        
        TextView comandasTitle = new TextView(this);
        comandasTitle.setText("🛒 Comandas Abertas");
        comandasTitle.setTextSize(22);
        comandasTitle.setTypeface(null, Typeface.BOLD);
        comandasTitle.setTextColor(Color.WHITE);
        titleGroup.addView(comandasTitle);

        tvStoreInfo = new TextView(this);
        tvStoreInfo.setText("Carregando loja...");
        tvStoreInfo.setTextSize(12);
        tvStoreInfo.setTextColor(Color.parseColor("#64748b"));
        titleGroup.addView(tvStoreInfo);
        
        header.addView(titleGroup, tgLp);
        
        GradientDrawable btnOutBg = new GradientDrawable();
        btnOutBg.setColor(Color.parseColor("#ef4444"));
        btnOutBg.setCornerRadius(20);

        Button btnLogout = new Button(this);
        btnLogout.setText("🚪 SAIR");
        btnLogout.setBackground(btnOutBg);
        btnLogout.setTextColor(Color.WHITE);
        btnLogout.setElevation(4f);
        btnLogout.setOnClickListener(v -> {
            autoRefreshHandler.removeCallbacks(autoRefreshRunnable);
            prefs.edit().clear().apply();
            showLogin();
        });
        header.addView(btnLogout);
        comandasLayout.addView(header);
        
        // Loading Bar
        loadingBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        loadingBar.setIndeterminate(true);
        loadingBar.setVisibility(View.GONE);
        LinearLayout.LayoutParams lpBar = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, 8);
        lpBar.setMargins(0, 0, 0, 16);
        comandasLayout.addView(loadingBar, lpBar);
        
        GradientDrawable btnRefBg = new GradientDrawable();
        btnRefBg.setColor(Color.parseColor("#3b82f6"));
        btnRefBg.setCornerRadius(24);

        Button btnRefresh = new Button(this);
        btnRefresh.setText("🔄 ATUALIZAR LISTA");
        btnRefresh.setBackground(btnRefBg);
        btnRefresh.setTextColor(Color.WHITE);
        btnRefresh.setElevation(8f);
        btnRefresh.setPadding(0, 40, 0, 40);
        LinearLayout.LayoutParams btnRefreshParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        btnRefreshParams.setMargins(0, 10, 0, 20);
        btnRefresh.setOnClickListener(v -> loadComandas());
        comandasLayout.addView(btnRefresh, btnRefreshParams);

        // Botão Fale Conosco / Suporte (Mandatório na certificação)
        GradientDrawable btnFaleComandasBg = new GradientDrawable();
        btnFaleComandasBg.setColor(Color.parseColor("#1e293b")); // Dark slate
        btnFaleComandasBg.setCornerRadius(24);
        btnFaleComandasBg.setStroke(2, Color.parseColor("#3b82f6")); // Subtle blue border

        Button btnFaleComandas = new Button(this);
        btnFaleComandas.setText("💬 FALE CONOSCO / SUPORTE");
        btnFaleComandas.setBackground(btnFaleComandasBg);
        btnFaleComandas.setTextColor(Color.WHITE);
        btnFaleComandas.setElevation(8f);
        btnFaleComandas.setPadding(0, 40, 0, 40);
        LinearLayout.LayoutParams btnFaleComandasParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        btnFaleComandasParams.setMargins(0, 0, 0, 30);
        btnFaleComandas.setOnClickListener(v -> NaxioUI.showFaleConoscoDialog(this));
        comandasLayout.addView(btnFaleComandas, btnFaleComandasParams);

        // Barra de Pesquisa de Mesa
        GradientDrawable searchBg = new GradientDrawable();
        searchBg.setColor(Color.parseColor("#1e293b"));
        searchBg.setCornerRadius(24);
        searchBg.setStroke(2, Color.parseColor("#334155"));

        searchInput = new EditText(this);
        searchInput.setHint("🔍 Buscar Mesa...");
        searchInput.setHintTextColor(Color.GRAY);
        searchInput.setTextColor(Color.WHITE);
        searchInput.setBackground(searchBg);
        searchInput.setPadding(40, 40, 40, 40);
        searchInput.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);
        LinearLayout.LayoutParams searchParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        searchParams.setMargins(0, 0, 0, 30);
        
        searchInput.addTextChangedListener(new android.text.TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) {
                String q = s.toString().trim().toLowerCase();
                if (listContainer == null) return;
                for (int i = 0; i < listContainer.getChildCount(); i++) {
                    View child = listContainer.getChildAt(i);
                    if (child.getTag() != null) {
                        String numStr = child.getTag().toString().toLowerCase();
                        child.setVisibility((q.isEmpty() || numStr.contains(q)) ? View.VISIBLE : View.GONE);
                    }
                }
            }
            @Override public void afterTextChanged(android.text.Editable s) {}
        });
        
        comandasLayout.addView(searchInput, searchParams);

        scrollList = new ScrollView(this);
        listContainer = new LinearLayout(this);
        listContainer.setOrientation(LinearLayout.VERTICAL);
        scrollList.addView(listContainer);
        comandasLayout.addView(scrollList);
    }

    private void showLogin() {
        loginLayout.setVisibility(View.VISIBLE);
        comandasLayout.setVisibility(View.GONE);
    }

    private void showComandas() {
        loginLayout.setVisibility(View.GONE);
        comandasLayout.setVisibility(View.VISIBLE);
    }

    private void performLogin() {
        String email = emailInput.getText().toString().trim();
        String pass = passInput.getText().toString();
        
        if (email.isEmpty() || pass.isEmpty()) {
            Toast.makeText(this, "Preencha e-mail e senha", Toast.LENGTH_SHORT).show();
            return;
        }
        
        Toast.makeText(this, "Autenticando...", Toast.LENGTH_SHORT).show();
        
        new Thread(() -> {
            try {
                // 1. 🛡️ Busca Manual na Tabela Profiles (Sem Supabase Auth)
                // Buscamos pelo e-mail e conferimos a senha no código, igual ao Web
                String query = "/rest/v1/profiles?email=eq." + java.net.URLEncoder.encode(email, "UTF-8") + "&select=*";
                URL urlProf = new URL(SUPABASE_URL + query);
                HttpURLConnection connP = (HttpURLConnection) urlProf.openConnection();
                connP.setRequestProperty("apikey", SUPABASE_KEY);
                connP.setRequestProperty("Authorization", "Bearer " + SUPABASE_KEY);
                
                int respCode = connP.getResponseCode();
                if (respCode != 200) {
                    runOnUiThread(() -> NaxioUI.showErrorDialog(this, "ERRO DE CONEXÃO", "Não foi possível consultar a tabela de perfis (Erro: " + respCode + ")"));
                    return;
                }

                BufferedReader rP = new BufferedReader(new InputStreamReader(connP.getInputStream()));
                StringBuilder sbP = new StringBuilder();
                String lP; while ((lP = rP.readLine()) != null) sbP.append(lP); rP.close();
                
                JSONArray profiles = new JSONArray(sbP.toString());
                if (profiles.length() == 0) {
                    runOnUiThread(() -> NaxioUI.showErrorDialog(this, "ACESSO NEGADO", "Usuário não encontrado."));
                    return;
                }
                
                JSONObject profile = profiles.getJSONObject(0);
                String dbPass = profile.optString("password", "");
                
                if (!dbPass.equals(pass)) {
                    runOnUiThread(() -> NaxioUI.showErrorDialog(this, "SENHA INCORRETA", "A senha digitada não confere com o cadastro."));
                    return;
                }

                String profileId = profile.getString("id");
                String role = profile.optString("role", "").toLowerCase();
                String finalStoreId = "";
                String finalStoreName = "";

                // 🏢 Detecção de Loja (Espelhado de modules_auth.js:207)
                if (role.equals("loja_admin")) {
                    URL urlAdmin = new URL(SUPABASE_URL + "/rest/v1/stores?admin_id=eq." + profileId + "&select=id,nome_loja");
                    HttpURLConnection connStore = (HttpURLConnection) urlAdmin.openConnection();
                    connStore.setRequestProperty("apikey", SUPABASE_KEY);
                    connStore.setRequestProperty("Authorization", "Bearer " + SUPABASE_KEY);
                    if (connStore.getResponseCode() == 200) {
                        BufferedReader r = new BufferedReader(new InputStreamReader(connStore.getInputStream()));
                        StringBuilder s = new StringBuilder();
                        String l; while ((l = r.readLine()) != null) s.append(l); r.close();
                        JSONArray stores = new JSONArray(s.toString());
                        if (stores.length() > 0) {
                            finalStoreId = stores.getJSONObject(0).getString("id");
                            finalStoreName = stores.getJSONObject(0).optString("nome_loja", "");
                        }
                    }
                } else if (role.equals("cozinha") || role.equals("caixa") || role.equals("entregador") || role.equals("garcom")) {
                    URL urlStaff = new URL(SUPABASE_URL + "/rest/v1/store_staff?profile_id=eq." + profileId + "&select=store_id,stores(nome_loja)");
                    HttpURLConnection connS = (HttpURLConnection) urlStaff.openConnection();
                    connS.setRequestProperty("apikey", SUPABASE_KEY);
                    connS.setRequestProperty("Authorization", "Bearer " + SUPABASE_KEY);
                    if (connS.getResponseCode() == 200) {
                        BufferedReader r = new BufferedReader(new InputStreamReader(connS.getInputStream()));
                        StringBuilder s = new StringBuilder();
                        String l; while ((l = r.readLine()) != null) s.append(l); r.close();
                        JSONArray staff = new JSONArray(s.toString());
                        if (staff.length() > 0) {
                            JSONObject stObj = staff.getJSONObject(0);
                            finalStoreId = stObj.getString("store_id");
                            if (stObj.has("stores") && !stObj.isNull("stores")) {
                                finalStoreName = stObj.getJSONObject("stores").optString("nome_loja", "");
                            }
                        }
                    }
                }

                if (finalStoreId.isEmpty()) {
                    runOnUiThread(() -> NaxioUI.showErrorDialog(this, "LOJA NÃO VINCULADA", "Usuário autenticado, mas sem loja associada.", "VINCULAR MANUAL", v -> mostrarDialogoVincularManual()));
                    return;
                }

                // 💾 Salva Dados (Usamos o SUPABASE_KEY como token pois não há JWT no modo manual)
                prefs.edit()
                    .putString("access_token", SUPABASE_KEY)
                    .putString("user_id", profileId)
                    .putString("store_id", finalStoreId)
                    .putString("store_name", finalStoreName)
                    .apply();

                // 💰 Busca Caixa Aberto (Usando o status 'aberto' do Web)
                URL urlSes = new URL(SUPABASE_URL + "/rest/v1/cash_sessions?store_id=eq." + finalStoreId + "&status=eq.aberto&select=id&order=created_at.desc&limit=1");
                HttpURLConnection connSes = (HttpURLConnection) urlSes.openConnection();
                connSes.setRequestProperty("apikey", SUPABASE_KEY);
                connSes.setRequestProperty("Authorization", "Bearer " + SUPABASE_KEY);
                if (connSes.getResponseCode() == 200) {
                    BufferedReader r = new BufferedReader(new InputStreamReader(connSes.getInputStream()));
                    StringBuilder s = new StringBuilder();
                    String l; while ((l = r.readLine()) != null) s.append(l); r.close();
                    JSONArray sessions = new JSONArray(s.toString());
                    if (sessions.length() > 0) {
                        prefs.edit().putString("active_session_id", sessions.getJSONObject(0).getString("id")).apply();
                    }
                }
                    
                runOnUiThread(() -> {
                    Toast.makeText(this, "Bem-vindo!", Toast.LENGTH_SHORT).show();
                    emailInput.setText(""); passInput.setText("");
                    showComandas(); loadComandas();
                });
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(this, "Erro de Conexão: " + e.getMessage(), Toast.LENGTH_LONG).show());
            }
        }).start();
    }

    private void mostrarDialogoVincularManual() {
        android.app.AlertDialog.Builder builder = new android.app.AlertDialog.Builder(this);
        builder.setTitle("Vincular Loja Manual");
        builder.setMessage("Insira o ID da sua loja (UUID) que aparece no Painel Web:");

        final EditText input = new EditText(this);
        input.setHint("00000000-0000-0000-0000-000000000000");
        input.setPadding(50, 40, 50, 40);
        builder.setView(input);

        builder.setPositiveButton("VINCULAR", (dialog, which) -> {
            String manualId = input.getText().toString().trim();
            if (manualId.length() > 10) {
                prefs.edit().putString("store_id", manualId).apply();
                Toast.makeText(this, "Loja vinculada com sucesso!", Toast.LENGTH_SHORT).show();
                showComandas();
                loadComandas();
            } else {
                Toast.makeText(this, "ID Inválido", Toast.LENGTH_SHORT).show();
            }
        });
        builder.setNegativeButton("CANCELAR", null);
        builder.show();
    }

    private void loadComandas() {
        listContainer.removeAllViews();
        loadingBar.setVisibility(View.VISIBLE);
        String storeId = prefs.getString("store_id", "");
        if (storeId.isEmpty()) return;

        String sessionId = prefs.getString("active_session_id", "Nenhum");

        // Debug: Long click para ver info técnica (Igual ao console do web)
        tvStoreInfo.setOnLongClickListener(v -> {
            String currentSid = prefs.getString("active_session_id", "Nenhum");
            String dbg = "Store ID: " + storeId + "\n" +
                         "Session ID: " + currentSid + "\n" +
                         "Token: " + (prefs.getString("access_token", "").isEmpty() ? "Anon" : "JWT Ativo");
            new android.app.AlertDialog.Builder(this)
                .setTitle("PAINEL DE DEPURAÇÃO")
                .setMessage(dbg)
                .setPositiveButton("OK", null)
                .show();
            return true;
        });

        new Thread(() -> {
            try {
                String accessToken = prefs.getString("access_token", SUPABASE_KEY);
                
                // 📋 Busca Comandas (Status expandido conforme comandas.js:3908)
                String query = "?store_id=eq." + storeId + "&status=in.(aberta,ocupada,pagando)&select=id,numero,status,items,created_at";
                URL url = new URL(SUPABASE_URL + "/rest/v1/comandas" + query);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(10000);
                conn.setRequestProperty("apikey", SUPABASE_KEY);
                conn.setRequestProperty("Authorization", "Bearer " + accessToken);
                
                int code = conn.getResponseCode();
                if(code != 200) {
                    runOnUiThread(() -> Toast.makeText(this, "Erro Comandas: " + code, Toast.LENGTH_SHORT).show());
                    return;
                }

                BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                StringBuilder sb = new StringBuilder();
                String line; while ((line = reader.readLine()) != null) sb.append(line); reader.close();
                JSONArray comandas = new JSONArray(sb.toString());
                
                // 💰 Busca Caixa Aberto (Lógica robusta: primeiro 'aberto', depois fallbacks)
                String sId = "";
                URL urlSes = new URL(SUPABASE_URL + "/rest/v1/cash_sessions?store_id=eq." + storeId + "&status=eq.aberto&select=id&order=created_at.desc&limit=1");
                HttpURLConnection connSes = (HttpURLConnection) urlSes.openConnection();
                connSes.setRequestProperty("apikey", SUPABASE_KEY);
                connSes.setRequestProperty("Authorization", "Bearer " + accessToken);
                
                if (connSes.getResponseCode() == 200) {
                    BufferedReader r = new BufferedReader(new InputStreamReader(connSes.getInputStream()));
                    StringBuilder s = new StringBuilder();
                    String l; while ((l = r.readLine()) != null) s.append(l); r.close();
                    JSONArray sessions = new JSONArray(s.toString());
                    
                    if (sessions.length() > 0) {
                        sId = sessions.getJSONObject(0).getString("id");
                    } else {
                        // Fallback: busca qualquer um que não esteja fechado (contingência)
                        URL urlFallback = new URL(SUPABASE_URL + "/rest/v1/cash_sessions?store_id=eq." + storeId + "&status=neq.fechado&select=id&order=created_at.desc&limit=1");
                        HttpURLConnection connF = (HttpURLConnection) urlFallback.openConnection();
                        connF.setRequestProperty("apikey", SUPABASE_KEY);
                        connF.setRequestProperty("Authorization", "Bearer " + accessToken);
                        if (connF.getResponseCode() == 200) {
                            BufferedReader r2 = new BufferedReader(new InputStreamReader(connF.getInputStream()));
                            StringBuilder s2 = new StringBuilder();
                            String l2; while ((l2 = r2.readLine()) != null) s2.append(l2); r2.close();
                            JSONArray sessions2 = new JSONArray(s2.toString());
                            if (sessions2.length() > 0) sId = sessions2.getJSONObject(0).getString("id");
                        }
                    }

                    // ✅ SÓ ATUALIZA SE A RESPOSTA FOI 200 (Evita deslogar caixa por erro de rede)
                    if (!sId.isEmpty()) {
                        prefs.edit().putString("active_session_id", sId).apply();
                    } else {
                        prefs.edit().remove("active_session_id").apply();
                    }
                }

                String finalSessionId = prefs.getString("active_session_id", "");
                runOnUiThread(() -> {
                    loadingBar.setVisibility(View.GONE);
                    renderComandas(comandas);
                    
                    // Atualiza header com status real do caixa
                    String sName = prefs.getString("store_name", "");
                    String hInfo = "📍 " + (sName.isEmpty() ? ("Loja: ..." + storeId.substring(Math.max(0, storeId.length() - 8))) : sName);
                    if (finalSessionId.isEmpty()) hInfo += " (⚠️ CAIXA FECHADO)";
                    tvStoreInfo.setText(hInfo);
                    tvStoreInfo.setTextColor(finalSessionId.isEmpty() ? Color.parseColor("#fbbf24") : Color.WHITE);
                });
            } catch (Exception e) {
                runOnUiThread(() -> {
                    loadingBar.setVisibility(View.GONE);
                    Toast.makeText(this, "Erro ao carregar: " + e.getMessage(), Toast.LENGTH_SHORT).show();
                });
            }
        }).start();
    }

    private void mostrarDialogoIdentificacao() {
        android.widget.LinearLayout layout = new android.widget.LinearLayout(this);
        layout.setOrientation(android.widget.LinearLayout.VERTICAL);
        layout.setPadding(60, 40, 60, 10);

        final android.widget.EditText inputCpf = new android.widget.EditText(this);
        inputCpf.setHint("CPF ou CNPJ (Opcional)");
        inputCpf.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);
        layout.addView(inputCpf);

        final android.widget.EditText inputNome = new android.widget.EditText(this);
        inputNome.setHint("Nome do Cliente (Opcional)");
        inputNome.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_FLAG_CAP_WORDS);
        layout.addView(inputNome);

        new android.app.AlertDialog.Builder(this)
            .setTitle("🧾 Identificar Cliente?")
            .setMessage("Informe os dados para constar na NFC-e.")
            .setView(layout)
            .setPositiveButton("AVANÇAR", (d, w) -> {
                clienteCpf = inputCpf.getText().toString().trim();
                clienteNome = inputNome.getText().toString().trim();
                mostrarDialogoDePagamento();
            })
            .setNegativeButton("PULAR", (d, w) -> {
                clienteCpf = "";
                clienteNome = "";
                mostrarDialogoDePagamento();
            })
            .setCancelable(true)
            .show();
    }

    private void renderComandas(JSONArray comandas) {
        try {
            if (comandas.length() == 0) {
                TextView emptyIcon = new TextView(this);
                emptyIcon.setText("🍽️");
                emptyIcon.setTextSize(64);
                emptyIcon.setGravity(Gravity.CENTER);
                emptyIcon.setPadding(0, 100, 0, 20);
                listContainer.addView(emptyIcon);
                
                TextView empty = new TextView(this);
                empty.setText("Nenhuma comanda aberta no momento.\nAs novas vendas aparecerão aqui.");
                empty.setTextColor(Color.parseColor("#94a3b8"));
                empty.setTextSize(16);
                empty.setGravity(Gravity.CENTER);
                empty.setPadding(0, 0, 0, 80);
                listContainer.addView(empty);
                return;
            }

            for (int i = 0; i < comandas.length(); i++) {
                JSONObject c = comandas.getJSONObject(i);
                String id = c.getString("id");
                String num = c.getString("numero");
                
                double total = 0.0;
                if (c.has("items") && !c.isNull("items")) {
                    JSONArray items = c.getJSONArray("items");
                    for(int j=0; j<items.length(); j++) {
                        JSONObject it = items.getJSONObject(j);
                        double preco = 0.0;
                        if(it.has("preco")) preco = it.getDouble("preco");
                        else if(it.has("price")) preco = it.getDouble("price");
                        int qtd = 1;
                        if(it.has("qtd")) qtd = it.getInt("qtd");
                        else if(it.has("quantity")) qtd = it.getInt("quantity");
                        total += (preco * qtd);
                    }
                }
                
                // Regra do 10% (Sincronizado com comandas.js)
                boolean isMesaIsenta = false;
                try {
                    int numInt = Integer.parseInt(num);
                    if (numInt == 300 || numInt == 301 || numInt == 302 || numInt == 304 || numInt == 305 || numInt == 306 || numInt == 307 || numInt == 308) {
                        isMesaIsenta = true;
                    }
                } catch (Exception e) {}
                
                double taxa = isMesaIsenta ? 0.0 : (total * 0.10);
                double totalComTaxa = total + taxa;

                String st = c.optString("status", "aberta");

                GradientDrawable cardBg = new GradientDrawable();
                cardBg.setColor(Color.parseColor("#1e293b")); // Slate 800
                cardBg.setCornerRadius(35);
                cardBg.setStroke(2, Color.parseColor("#334155"));

                LinearLayout card = new LinearLayout(this);
                card.setOrientation(LinearLayout.VERTICAL);
                card.setBackground(cardBg);
                card.setElevation(10f);
                card.setPadding(60, 60, 60, 60);
                card.setTag(num);
                
                LinearLayout headerRow = new LinearLayout(this);
                headerRow.setOrientation(LinearLayout.HORIZONTAL);
                headerRow.setGravity(Gravity.CENTER_VERTICAL);
                
                TextView title = new TextView(this);
                title.setText("Mesa " + num);
                title.setTextColor(Color.WHITE);
                title.setTextSize(24);
                title.setTypeface(null, Typeface.BOLD);
                LinearLayout.LayoutParams titleLp = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1.0f);
                headerRow.addView(title, titleLp);
                
                // Status Pill Badge
                GradientDrawable pillBg = new GradientDrawable();
                pillBg.setCornerRadius(40);
                boolean isOcupada = st.equals("ocupada");
                pillBg.setColor(isOcupada ? Color.parseColor("#78350f") : Color.parseColor("#1e3a5f"));
                pillBg.setStroke(2, isOcupada ? Color.parseColor("#f59e0b") : Color.parseColor("#3b82f6"));

                TextView statusBadge = new TextView(this);
                statusBadge.setText(isOcupada ? "🔴 OCUPADA" : "🟢 ABERTA");
                statusBadge.setTextColor(isOcupada ? Color.parseColor("#f59e0b") : Color.parseColor("#60a5fa"));
                statusBadge.setTextSize(11);
                statusBadge.setTypeface(null, Typeface.BOLD);
                statusBadge.setBackground(pillBg);
                statusBadge.setPadding(24, 12, 24, 12);
                headerRow.addView(statusBadge);
                
                card.addView(headerRow);

                View divider = new View(this);
                divider.setBackgroundColor(Color.parseColor("#334155"));
                LinearLayout.LayoutParams divLp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 2);
                divLp.setMargins(0, 25, 0, 25);
                card.addView(divider, divLp);
                
                if (taxa > 0) {
                    TextView txtTaxa = new TextView(this);
                    txtTaxa.setText("Serviço (10%): R$ " + String.format("%.2f", taxa));
                    txtTaxa.setTextColor(Color.parseColor("#94a3b8")); // Slate 400
                    txtTaxa.setTextSize(14);
                    txtTaxa.setPadding(0, 10, 0, 5);
                    card.addView(txtTaxa);
                }

                TextView val = new TextView(this);
                val.setText("Total: R$ " + String.format("%.2f", totalComTaxa));
                val.setTextColor(Color.parseColor("#10b981")); // Emerald 500
                val.setTextSize(20);
                val.setTypeface(null, Typeface.BOLD);
                val.setPadding(0, 5, 0, 30);
                card.addView(val);
                
                GradientDrawable btnBg = new GradientDrawable();
                btnBg.setColor(Color.parseColor("#3b82f6")); // Blue 500
                btnBg.setCornerRadius(24);

                Button btn = new Button(this);
                btn.setText("VER E PAGAR");
                btn.setBackground(btnBg);
                btn.setTextColor(Color.WHITE);
                btn.setTypeface(null, Typeface.BOLD);
                btn.setElevation(6f);
                btn.setPadding(0, 30, 0, 30);
                // The parameters we pass here must be final or effectively final
                final JSONObject finalC = c;
                final String finalId = id;
                final String finalNum = num;
                final double finalTotal = totalComTaxa;
                btn.setOnClickListener(v -> prepararPagamentoComanda(finalC, finalId, finalNum, finalTotal));
                card.addView(btn);

                // Fade-in + slide-up animation
                AnimationSet anim = new AnimationSet(true);
                AlphaAnimation fadeIn = new AlphaAnimation(0f, 1f);
                fadeIn.setDuration(300);
                TranslateAnimation slideUp = new TranslateAnimation(0, 0, 60, 0);
                slideUp.setDuration(300);
                anim.addAnimation(fadeIn);
                anim.addAnimation(slideUp);
                anim.setStartOffset(i * 80L);
                card.startAnimation(anim);

                LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
                lp.setMargins(0, 20, 0, 30);
                listContainer.addView(card, lp);
            }

            // Re-apply filter se houver texto
            if (searchInput != null && !searchInput.getText().toString().isEmpty()) {
                String q = searchInput.getText().toString().trim().toLowerCase();
                for (int k = 0; k < listContainer.getChildCount(); k++) {
                    View child = listContainer.getChildAt(k);
                    if (child.getTag() != null) {
                        String numStr = child.getTag().toString().toLowerCase();
                        child.setVisibility((q.isEmpty() || numStr.contains(q)) ? View.VISIBLE : View.GONE);
                    }
                }
            }
        } catch (Exception e) {}
    }

    private void prepararPagamentoComanda(JSONObject c, String id, String num, double total) {
        // Se abriu uma comanda diferente, zera o carrinho de pagamentos e dados do cliente
        if (currentComandaId == null || !currentComandaId.equals(id)) {
            accumulatedPayments = new JSONArray();
            accumulatedTotal = 0.0;
            accumulatedDiscount = 0.0;
            clienteCpf = "";
            clienteNome = "";
        }
        
        currentComandaObj = c;
        currentComandaId = id;
        currentComandaNum = num;
        originalTotal = total;
        
        try {
            currentItems = c.has("items") && !c.isNull("items") ? c.getJSONArray("items") : new JSONArray();
        } catch (Exception e) {
            currentItems = new JSONArray();
        }
        
        mostrarDialogoIdentificacao();
    }

    private void mostrarDialogoDePagamento() {
        String sessionId = prefs.getString("active_session_id", "");
        
        if (sessionId.isEmpty()) {
            NaxioUI.showErrorDialog(this, "🚫 CAIXA FECHADO", "Você precisa abrir o caixa no Painel Web antes de receber pagamentos pelo APK.");
            return;
        }

        if (currentDialog != null) currentDialog.dismiss();
        
        currentDialog = new android.app.Dialog(this);
        currentDialog.requestWindowFeature(android.view.Window.FEATURE_NO_TITLE);
        
        GradientDrawable dialogBg = new GradientDrawable();
        dialogBg.setColor(Color.parseColor("#0f172a"));
        dialogBg.setCornerRadius(40);
        dialogBg.setStroke(4, Color.parseColor("#334155"));

        android.widget.ScrollView scrollView = new android.widget.ScrollView(this);
        scrollView.setBackground(dialogBg);

        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        // Retiramos o background do layout e colocamos no ScrollView
        layout.setPadding(60, 60, 60, 60);
        
        TextView title = new TextView(this);
        title.setText("Mesa " + currentComandaNum);
        title.setTextColor(Color.WHITE);
        title.setTextSize(22);
        title.setTypeface(null, Typeface.BOLD);
        title.setPadding(0, 0, 0, 10);
        layout.addView(title);
        
        // Exibição dos Totais e Acumulados
        TextView tvTotal = new TextView(this);
        tvTotal.setText("TOTAL DA MESA: R$ " + String.format("%.2f", originalTotal));
        tvTotal.setTextColor(Color.LTGRAY);
        layout.addView(tvTotal);
        
        if (accumulatedTotal > 0) {
            TextView tvAcumulado = new TextView(this);
            tvAcumulado.setText("JÁ PAGO (CARRINHO): R$ " + String.format("%.2f", accumulatedTotal));
            tvAcumulado.setTextColor(Color.parseColor("#f59e0b")); // Laranja
            tvAcumulado.setPadding(0, 5, 0, 5);
            layout.addView(tvAcumulado);
        }

        if (accumulatedDiscount > 0) {
            TextView tvDesc = new TextView(this);
            tvDesc.setText("DESCONTO APLICADO: - R$ " + String.format("%.2f", accumulatedDiscount));
            tvDesc.setTextColor(Color.parseColor("#ef4444")); // Vermelho
            tvDesc.setPadding(0, 5, 0, 5);
            layout.addView(tvDesc);
        }
        
        double valorFaltanteTemp = (originalTotal - accumulatedDiscount) - accumulatedTotal;
        if (valorFaltanteTemp < 0) valorFaltanteTemp = 0.0;
        final double valorFaltante = valorFaltanteTemp;
        
        TextView tvFalta = new TextView(this);
        tvFalta.setText("FALTA PAGAR: R$ " + String.format("%.2f", valorFaltante));
        tvFalta.setTextColor(Color.parseColor("#10b981")); // Verde
        tvFalta.setTextSize(18);
        tvFalta.setTypeface(null, Typeface.BOLD);
        tvFalta.setPadding(0, 10, 0, 20);
        layout.addView(tvFalta);
        
        // Input para o valor deste pagamento
        TextView lblPagar = new TextView(this);
        lblPagar.setText("INFORME O VALOR DESTE PAGAMENTO:");
        lblPagar.setTextColor(Color.GRAY);
        layout.addView(lblPagar);
        
        GradientDrawable inputBg = new GradientDrawable();
        inputBg.setColor(Color.parseColor("#1e293b"));
        inputBg.setCornerRadius(20);
        inputBg.setStroke(2, Color.parseColor("#334155"));

        EditText inputValor = new EditText(this);
        inputValor.setText(String.format("%.2f", valorFaltante).replace(",", "."));
        inputValor.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        inputValor.setBackground(inputBg);
        inputValor.setTextColor(Color.WHITE);
        inputValor.setPadding(40, 40, 40, 40);
        layout.addView(inputValor);
        
        // Buttons
        Button btnCredito = criarBotaoPremium("PASSAR CRÉDITO", "#10b981");
        Button btnDebito = criarBotaoPremium("PASSAR DÉBITO", "#3b82f6");
        Button btnPix = criarBotaoPremium("PASSAR PIX", "#8b5cf6");
        Button btnDinheiro = criarBotaoPremium("RECEBER EM DINHEIRO", "#f59e0b");
        Button btnEmitirNfce = criarBotaoPremium("📄 EMITIR NFC-E DIRETO", "#f59e0b");

        View.OnClickListener payListener = v -> {
            try {
                double amount = Double.parseDouble(inputValor.getText().toString().replace(",", "."));
                if (amount <= 0 || amount > valorFaltante + 0.05) { // Permite pequena margem de arredondamento
                    Toast.makeText(this, "Valor inválido ou maior que o restante.", Toast.LENGTH_SHORT).show();
                    return;
                }
                
                if (v == btnEmitirNfce) {
                    // Manual NFC-e emission
                    adicionarPagamentoAcumulado("01", amount, "DINHEIRO", "", null);
                } else if (v == btnDinheiro) {
                    adicionarPagamentoAcumulado("01", amount, "DINHEIRO", "", null);
                } else {
                    String type = v == btnCredito ? "CREDIT" : (v == btnDebito ? "DEBIT" : "PIX");
                    iniciarGetnetPagamentoParcial(amount, type);
                }
            } catch (Exception e) {
                Toast.makeText(this, "Erro no valor digitado.", Toast.LENGTH_SHORT).show();
            }
        };
        
        btnCredito.setOnClickListener(payListener);
        btnDebito.setOnClickListener(payListener);
        btnPix.setOnClickListener(payListener);
        btnDinheiro.setOnClickListener(payListener);
        btnEmitirNfce.setOnClickListener(payListener);
        
        layout.addView(btnCredito, getBtnParams());
        layout.addView(btnDebito, getBtnParams());
        layout.addView(btnPix, getBtnParams());
        layout.addView(btnDinheiro, getBtnParams());
        
        TextView separador = new TextView(this);
        separador.setText("OUTRAS OPÇÕES:");
        separador.setTextColor(Color.GRAY);
        separador.setPadding(0, 20, 0, 10);
        layout.addView(separador);
        
        layout.addView(btnEmitirNfce, getBtnParams());
        
        Button btnClose = criarBotaoPremium("FECHAR / CANCELAR", "#475569");
        btnClose.setOnClickListener(v -> {
            accumulatedPayments = new JSONArray(); // zera carrinho ao fechar
            accumulatedTotal = 0.0;
            accumulatedDiscount = 0.0;
            currentDialog.dismiss();
        });

        Button btnDesconto = criarBotaoPremium("✂️ APLICAR DESCONTO", "#ef4444");
        btnDesconto.setOnClickListener(v -> {
            try {
                double discount = Double.parseDouble(inputValor.getText().toString().replace(",", "."));
                if (discount <= 0 || discount > valorFaltante) {
                    Toast.makeText(this, "Valor de desconto inválido.", Toast.LENGTH_SHORT).show();
                    return;
                }
                accumulatedDiscount += discount;
                Toast.makeText(this, "Desconto de R$ " + discount + " aplicado!", Toast.LENGTH_SHORT).show();
                verificarSeComandaFoiPagaPorCompleto();
            } catch (Exception e) {
                Toast.makeText(this, "Erro no valor digitado.", Toast.LENGTH_SHORT).show();
            }
        });
        
        layout.addView(btnDesconto, getBtnParams());
        layout.addView(btnClose, getBtnParams());

        scrollView.addView(layout);
        currentDialog.setContentView(scrollView);
        currentDialog.show();
    }

    private Button criarBotaoPremium(String text, String colorHex) {
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor(colorHex));
        bg.setCornerRadius(24);
        
        Button btn = new Button(this);
        btn.setText(text);
        btn.setBackground(bg);
        btn.setTextColor(Color.WHITE);
        btn.setTypeface(null, Typeface.BOLD);
        btn.setElevation(6f);

        // Feedback Tátil Nativo
        btn.setOnTouchListener((v, event) -> {
            switch (event.getAction()) {
                case android.view.MotionEvent.ACTION_DOWN:
                    v.animate().scaleX(0.95f).scaleY(0.95f).setDuration(100).start();
                    break;
                case android.view.MotionEvent.ACTION_UP:
                case android.view.MotionEvent.ACTION_CANCEL:
                    v.animate().scaleX(1f).scaleY(1f).setDuration(100).start();
                    break;
            }
            return false;
        });

        return btn;
    }

    private LinearLayout.LayoutParams getBtnParams() {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.setMargins(0, 10, 0, 10);
        return lp;
    }

    private void iniciarGetnetPagamentoParcial(double amount, String type) {
        pendingAmount = amount;
        pendingPaymentType = type;
        
        // Salva no SharedPreferences o ESTADO COMPLETO para evitar perda de dados se o Android matar o app na DX8000
        prefs.edit()
             .putString("backup_payment_type", type)
             .putFloat("backup_payment_amount", (float) amount)
             .putString("backup_comanda_id", currentComandaId)
             .putString("backup_comanda_num", currentComandaNum)
             .putFloat("backup_original_total", (float) originalTotal)
             .putFloat("backup_accumulated_total", (float) accumulatedTotal)
             .putFloat("backup_accumulated_discount", (float) accumulatedDiscount)
             .putString("backup_current_items", currentItems.toString())
             .putString("backup_accumulated_payments", accumulatedPayments.toString())
             .putString("backup_cliente_nome", clienteNome != null ? clienteNome : "")
             .putString("backup_cliente_cpf", clienteCpf != null ? clienteCpf : "")
             .apply();
        
        try {
            int amountCents = (int) Math.round(amount * 100);
            String amountFormatted = String.format(Locale.US, "%012d", amountCents);
            
            // Cria URIs para Deep Link já com os parâmetros (exigido por algumas versões)
            String uriPagamento = "getnet://pagamento/v1/payment?amount=" + amountFormatted + "&payment_type=" + type.toLowerCase(Locale.US);
            String uriPayment = "getnet://payment/v1/payment?amount=" + amountFormatted + "&payment_type=" + type.toLowerCase(Locale.US);
            
            // Cria uma lista de Intents possíveis (Ações e Deep Links suportados pelas diferentes versões da Getnet)
            Intent[] possibleIntents = new Intent[] {
                new Intent("br.com.getnet.posdigital.intent.action.PAYMENT"),
                new Intent("com.getnet.posdigital.payment.PAYMENT"),
                new Intent("com.getnet.smartpos.intent.action.PAYMENT"),
                new Intent(Intent.ACTION_VIEW, android.net.Uri.parse(uriPagamento)),
                new Intent(Intent.ACTION_VIEW, android.net.Uri.parse(uriPayment))
            };
            
            String[] possiblePackages = {
                "br.com.getnet.posdigital",
                "com.getnet.posdigital",
                "com.getnet.posdigital.service",
                "com.getnet.getnetserviceapp",
                "com.getnet.smartpos",
                null // Testar sem pacote (implícito) como último recurso
            };
            
            Intent resolvedIntent = null;
            
            // Testa todas as combinações de Action/URI com os Pacotes conhecidos
            outerLoop:
            for (Intent intent : possibleIntents) {
                // Adiciona parâmetros também no Bundle (necessário para Actions Diretas)
                intent.putExtra("amount", amountFormatted); // Usa o de 12 dígitos como principal
                intent.putExtra("amount_string", String.valueOf(amountCents)); // Fallback
                intent.putExtra("currency", "BRL");
                intent.putExtra("currencyCode", "986"); // Padrão ISO 4217 numérico (Getnet)
                intent.putExtra("currencyPosition", "CURRENCY_AFTER_AMOUNT");
                intent.putExtra("transaction_type", type);
                intent.putExtra("payment_type", type.toLowerCase(Locale.US));
                intent.putExtra("paymentType", type);
                if (type.equals("CREDIT")) {
                    intent.putExtra("installments", "1");
                }
                
                for (String pkg : possiblePackages) {
                    intent.setPackage(pkg);
                    if (intent.resolveActivity(getPackageManager()) != null) {
                        resolvedIntent = intent;
                        break outerLoop;
                    }
                }
            }
            
            if (resolvedIntent != null) {
                startActivityForResult(resolvedIntent, 1001);
            } else {
                // Se nenhum resolver, tenta o disparo original com fallback vazio apenas para gerar a exceção clara
                Intent defaultIntent = new Intent("br.com.getnet.posdigital.intent.action.PAYMENT");
                defaultIntent.putExtra("amount", amountFormatted);
                defaultIntent.putExtra("amount_string", String.valueOf(amountCents));
                defaultIntent.putExtra("currency", "BRL");
                defaultIntent.putExtra("currencyCode", "986");
                defaultIntent.putExtra("currencyPosition", "CURRENCY_AFTER_AMOUNT");
                defaultIntent.putExtra("transaction_type", type);
                defaultIntent.putExtra("payment_type", type.toLowerCase(Locale.US));
                defaultIntent.putExtra("paymentType", type);
                if (type.equals("CREDIT")) {
                    defaultIntent.putExtra("installments", "1");
                }
                startActivityForResult(defaultIntent, 1001);
            }
        } catch (Exception e) {
            String fullError = android.util.Log.getStackTraceString(e);
            new android.app.AlertDialog.Builder(this)
                .setTitle("Erro Naxio V4 (Detalhado)")
                .setMessage("Ocorreu uma falha ao iniciar o pagamento Getnet:\n\n" + e.getMessage() + "\n\nStack Trace Completo:\n" + fullError)
                .setPositiveButton("OK", null)
                .show();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        
        // Restaura o ESTADO COMPLETO do carrinho caso o Android tenha matado o App em background
        if (pendingPaymentType == null || currentComandaId == null) {
            pendingPaymentType = prefs.getString("backup_payment_type", "CREDIT");
            pendingAmount = prefs.getFloat("backup_payment_amount", 0.0f);
            currentComandaId = prefs.getString("backup_comanda_id", "");
            currentComandaNum = prefs.getString("backup_comanda_num", "0");
            originalTotal = prefs.getFloat("backup_original_total", 0.0f);
            accumulatedTotal = prefs.getFloat("backup_accumulated_total", 0.0f);
            accumulatedDiscount = prefs.getFloat("backup_accumulated_discount", 0.0f);
            clienteNome = prefs.getString("backup_cliente_nome", "");
            clienteCpf = prefs.getString("backup_cliente_cpf", "");
            try {
                currentItems = new org.json.JSONArray(prefs.getString("backup_current_items", "[]"));
                accumulatedPayments = new org.json.JSONArray(prefs.getString("backup_accumulated_payments", "[]"));
            } catch (Exception e) {
                e.printStackTrace();
            }
        }
        
        if (requestCode == 1001 && resultCode == RESULT_OK && data != null) {
            String nsu = data.getStringExtra("nsu");
            if (nsu == null) nsu = data.getStringExtra("e2e_id");
            if (nsu == null) nsu = data.getStringExtra("nsuTerminal"); 
            
            String auth = data.getStringExtra("auth_code");
            if (auth == null) auth = data.getStringExtra("authcode");
            if (auth == null) auth = data.getStringExtra("authorizationcode");
            if (auth == null) auth = data.getStringExtra("authorizationCode");
            if (auth == null) auth = data.getStringExtra("authorization_code");
            
            String bandeira = data.getStringExtra("card_brand");
            if (bandeira == null) bandeira = data.getStringExtra("brand");
            if (bandeira == null) bandeira = data.getStringExtra("cardbrand");
            if (bandeira == null) bandeira = "VISA"; 
            
            // Verifica se a maquininha retornou ok mas não autorizou (falta de NSU/Auth ou código de erro)
            String errorCode = data.getStringExtra("codigoRetorno");
            if (errorCode == null) errorCode = data.getStringExtra("responseCode");
            
            boolean hasError = (errorCode != null && !errorCode.equals("00") && !errorCode.equals("0") && !errorCode.equals("000"));
            boolean missingAuthData = (nsu == null || nsu.trim().isEmpty() || auth == null || auth.trim().isEmpty());
            
            if (hasError || missingAuthData) {
                String msg = "Pagamento não aprovado ou cancelado";
                if (data.getStringExtra("mensagemRetorno") != null) msg = data.getStringExtra("mensagemRetorno");
                else if (data.getStringExtra("reason") != null) msg = data.getStringExtra("reason");
                
                Toast.makeText(this, msg, Toast.LENGTH_LONG).show();
                mostrarDialogoDePagamento();
                return;
            }
            
            String codeSefaz = pendingPaymentType.equals("CREDIT") ? "03" : (pendingPaymentType.equals("DEBIT") ? "04" : "17");
            adicionarPagamentoAcumulado(codeSefaz, pendingAmount, auth != null ? auth : "000000", nsu != null ? nsu : "000000", bandeira);
        } else {
            Toast.makeText(this, "Pagamento cancelado na Maquininha", Toast.LENGTH_SHORT).show();
            mostrarDialogoDePagamento(); // Reabre o dialog com o carrinho atual
        }
    }

    private void adicionarPagamentoAcumulado(String codeSefaz, double amount, String auth, String nsu, String bandeira) {
        try {
            JSONObject pmt = new JSONObject();
            pmt.put("code", codeSefaz);
            pmt.put("amount", amount); // Conforme relatorios.js
            pmt.put("val", amount);    // Fallback
            pmt.put("method", codeSefaz.equals("01") ? "DINHEIRO" : (codeSefaz.equals("17") ? "PIX" : "CARTAO"));
            pmt.put("aut", auth != null ? auth : "");
            pmt.put("nsu", nsu != null ? nsu : "");
            pmt.put("bandeira", bandeira != null ? bandeira.toUpperCase(Locale.US) : "VISA");
            
            // Fixando o CNPJ da Credenciadora Getnet para NFC-e formatado como a API web faz (10.440.482/0001-54)
            if (codeSefaz.equals("03") || codeSefaz.equals("04") || codeSefaz.equals("17")) {
                pmt.put("cnpj", "10.440.482/0001-54"); 
            }
            
            accumulatedPayments.put(pmt);
            accumulatedTotal += amount;
            
            Toast.makeText(this, "Pagamento R$ " + amount + " Adicionado!", Toast.LENGTH_SHORT).show();
            
            verificarSeComandaFoiPagaPorCompleto();
            
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void verificarSeComandaFoiPagaPorCompleto() {
        if (accumulatedTotal >= (originalTotal - accumulatedDiscount) - 0.05) {
            // Conta paga na totalidade! Emitir NFC-e única com todos os pagamentos.
            if (currentDialog != null) currentDialog.dismiss();
            processarFechamentoTotalEEmissaoNFCE();
        } else {
            // Ainda falta dinheiro, reabre a tela
            mostrarDialogoDePagamento();
        }
    }

    private void processarFechamentoTotalEEmissaoNFCE() {
        Toast.makeText(this, "Finalizando mesa... Aguarde.", Toast.LENGTH_LONG).show();
        String storeId = prefs.getString("store_id", "");
        
        // ✅ Captura TUDO como final ANTES de resetar o estado e ANTES de entrar na thread
        final JSONArray finalPayments = accumulatedPayments;
        final double finalTotal = accumulatedTotal;
        final double finalDiscount = accumulatedDiscount; // CRÍTICO: capturar antes do reset!
        final String cid = currentComandaId;
        final String cnum = currentComandaNum;
        final JSONArray citems = currentItems;
        final String sessionId = prefs.getString("active_session_id", "");
        
        // ✅ Limpa estado atual da view para o próximo cliente DEPOIS de capturar
        accumulatedPayments = new JSONArray();
        accumulatedTotal = 0.0;
        accumulatedDiscount = 0.0;
        currentComandaId = null;

        new Thread(() -> {
            try {
                String accessToken = prefs.getString("access_token", SUPABASE_KEY);
                SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
                sdf.setTimeZone(TimeZone.getTimeZone("UTC"));
                String nowUtc = sdf.format(new Date());
                
                String userId = prefs.getString("user_id", "");
                
                // 1. Atualiza a Comanda no Supabase para 'fechada' (Arquiva no Web)
                JSONObject patchComanda = new JSONObject();
                patchComanda.put("status", "fechada"); 
                patchComanda.put("items", citems);
                patchComanda.put("total_pago", finalTotal);
                patchComanda.put("tipo_comanda", "passante");
                patchComanda.put("updated_at", nowUtc);
                patchComanda.put("store_id", storeId);
                
                URL urlComanda = new URL(SUPABASE_URL + "/rest/v1/comandas?id=eq." + cid);
                HttpURLConnection connCom = (HttpURLConnection) urlComanda.openConnection();
                connCom.setRequestMethod("PATCH");
                connCom.setRequestProperty("Content-Type", "application/json");
                connCom.setRequestProperty("apikey", SUPABASE_KEY);
                connCom.setRequestProperty("Authorization", "Bearer " + accessToken);
                connCom.setDoOutput(true);
                
                OutputStream osCom = connCom.getOutputStream();
                osCom.write(patchComanda.toString().getBytes("UTF-8"));
                osCom.close();
                int patchCode = connCom.getResponseCode();
                
                if (patchCode < 200 || patchCode >= 300) {
                    runOnUiThread(() -> Toast.makeText(this, "Erro ao fechar comanda: " + patchCode, Toast.LENGTH_LONG).show());
                    return;
                }

                // 2. Criar a Ordem Final de Venda em 'orders' (Fiel ao exemplo do usuário)
                JSONObject obsJson = new JSONObject();
                obsJson.put("mesa", cnum);
                obsJson.put("vendedor", prefs.getString("store_name", "APK POS"));
                obsJson.put("cliente_nome", clienteNome);
                obsJson.put("cliente_cpf", clienteCpf);
                obsJson.put("pagamentos", finalPayments);
                obsJson.put("desconto", finalDiscount);
                obsJson.put("guia", JSONObject.NULL);
                obsJson.put("itens", citems);
                obsJson.put("total", originalTotal);
                
                JSONObject orderPayload = new JSONObject();
                orderPayload.put("store_id", storeId);
                
                // session_id é UUID, só envia se tiver formato válido
                if (sessionId != null && sessionId.length() > 20) {
                    orderPayload.put("session_id", sessionId);
                }
                
                orderPayload.put("status", "concluido");
                orderPayload.put("origem_venda", "comanda");
                orderPayload.put("total_pago", finalTotal);
                
                // Conforme exemplo, a observacao é a alma do negócio aqui
                orderPayload.put("observacao", obsJson.toString()); 
                orderPayload.put("payments_info", finalPayments);
                orderPayload.put("created_at", nowUtc);
                
                URL urlOrder = new URL(SUPABASE_URL + "/rest/v1/orders");
                HttpURLConnection connOrd = (HttpURLConnection) urlOrder.openConnection();
                connOrd.setRequestMethod("POST");
                connOrd.setRequestProperty("Content-Type", "application/json");
                connOrd.setRequestProperty("apikey", SUPABASE_KEY);
                connOrd.setRequestProperty("Authorization", "Bearer " + accessToken);
                connOrd.setRequestProperty("Prefer", "return=representation");
                connOrd.setDoOutput(true);
                
                OutputStream osOrd = connOrd.getOutputStream();
                osOrd.write(orderPayload.toString().getBytes("UTF-8"));
                osOrd.close();
                
                int postCode = connOrd.getResponseCode();
                if (postCode < 200 || postCode >= 300) {
                    // Captura erro detalhado para o Toast
                    BufferedReader errR = new BufferedReader(new InputStreamReader(connOrd.getErrorStream()));
                    StringBuilder errS = new StringBuilder();
                    String errL; while ((errL = errR.readLine()) != null) errS.append(errL); errR.close();
                    final String serverError = errS.toString();
                    
                    runOnUiThread(() -> {
                        Toast.makeText(this, "Erro ao criar Ordem: " + postCode + "\n" + serverError, Toast.LENGTH_LONG).show();
                    });
                    return;
                }
                
                String orderIdStr = "";
                BufferedReader readerOrd = new BufferedReader(new InputStreamReader(connOrd.getInputStream()));
                StringBuilder sbOrd = new StringBuilder();
                String lineOrd;
                while ((lineOrd = readerOrd.readLine()) != null) sbOrd.append(lineOrd);
                readerOrd.close();
                JSONArray arrOrd = new JSONArray(sbOrd.toString());
                orderIdStr = arrOrd.getJSONObject(0).getString("id");

                // 3. Emitir a NFC-e (Lógica Completa com Confirmação Visual)
                String chaveNfce = "";
                JSONObject resF = null;
                
                if (!orderIdStr.isEmpty()) {
                    try {
                        JSONObject fiscalPayload = new JSONObject();
                        fiscalPayload.put("order_id", orderIdStr);
                        fiscalPayload.put("store_id", storeId);
                        fiscalPayload.put("cpf_nota", clienteCpf);
                        fiscalPayload.put("nome_nota", clienteNome);
                        fiscalPayload.put("items_payload", citems);
                        fiscalPayload.put("payments_payload", finalPayments); 
                        
                        URL urlFiscal = new URL(API_NFCE_URL);
                        HttpURLConnection connFisc = (HttpURLConnection) urlFiscal.openConnection();
                        connFisc.setConnectTimeout(25000);
                        connFisc.setRequestMethod("POST");
                        connFisc.setRequestProperty("Content-Type", "application/json");
                        connFisc.setDoOutput(true);
                        
                        OutputStream osFisc = connFisc.getOutputStream();
                        osFisc.write(fiscalPayload.toString().getBytes("UTF-8"));
                        osFisc.flush(); osFisc.close();
                        
                        int fiscCode = connFisc.getResponseCode();
                        java.io.InputStream is = (fiscCode >= 200 && fiscCode < 300) ? connFisc.getInputStream() : connFisc.getErrorStream();
                        BufferedReader rF = new BufferedReader(new InputStreamReader(is));
                        StringBuilder sbF = new StringBuilder();
                        String lF; while ((lF = rF.readLine()) != null) sbF.append(lF); rF.close();
                        
                        resF = new JSONObject(sbF.toString());
                        if (fiscCode == 200 && (resF.optBoolean("sucesso") || "autorizado".equals(resF.optString("status")))) {
                            chaveNfce = resF.optString("chave", "");
                        }
                    } catch (Exception e) {
                        android.util.Log.e("NAXIO_FISCAL", "Erro: " + e.getMessage());
                    }
                }

                final String finalChave = chaveNfce;
                final String motivoErro = (resF != null) ? resF.optString("message", resF.optString("motivo_sefaz", "Erro de comunicação com o servidor fiscal.")) : "Não foi possível conectar ao servidor de emissão.";
                
                runOnUiThread(() -> {
                    if (!finalChave.isEmpty()) {
                        android.app.AlertDialog.Builder builder = new android.app.AlertDialog.Builder(this);
                        builder.setTitle("✅ VENDA E NFC-e OK");
                        builder.setMessage("Mesa " + cnum + " finalizada!\n\nChave: " + finalChave);
                        builder.setPositiveButton("IMPRIMIR", (d, w) -> {
                            imprimirComprovanteNativo(cnum, finalChave, finalTotal, citems);
                            loadComandas();
                        });
                        builder.setNegativeButton("CONCLUIR", (d, w) -> loadComandas());
                        builder.setCancelable(false);
                        builder.show();
                    } else {
                        // Caso de Erro na Nota, mas Venda OK
                        android.app.AlertDialog.Builder builder = new android.app.AlertDialog.Builder(this);
                        builder.setTitle("⚠️ VENDA OK, MAS NFC-e FALHOU");
                        builder.setMessage("A mesa foi fechada e o dinheiro registrado.\n\nContudo, a NFC-e foi REJEITADA:\n\"" + motivoErro + "\"\n\nVocê poderá reemitir esta nota pelo Painel Web em Relatórios.");
                        builder.setPositiveButton("ENTENDIDO", (d, w) -> loadComandas());
                        builder.setCancelable(false);
                        builder.show();
                    }
                });
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(this, "Erro Crítico: " + e.getMessage(), Toast.LENGTH_LONG).show());
            }
        }).start();
    }

    private void imprimirComprovanteNativo(String mesa, String chave, double total, JSONArray itens) {
        try {
            // Acessa a impressora nativa da Getnet via SDK PosDigital
            // Nome correto identificado: IPrinterService
            final com.getnet.posdigital.printer.IPrinterService printer = com.getnet.posdigital.PosDigital.getInstance().getPrinter();
            printer.init();
            printer.addText(0, "      NAXIO SOFTWARE POS      ");
            printer.addText(0, "------------------------------");
            printer.addText(0, "COMPROVANTE DE VENDA - MESA " + mesa);
            printer.addText(0, "DATA: " + new SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.getDefault()).format(new Date()));
            printer.addText(0, "------------------------------");
            printer.addText(0, "VALOR TOTAL: R$ " + String.format("%.2f", total));
            printer.addText(0, "------------------------------");
            printer.addText(0, "CHAVE DE ACESSO NFC-E:");
            printer.addText(0, chave);
            printer.addText(0, "------------------------------");
            printer.addText(0, "   OBRIGADO PELA PREFERENCIA  ");
            printer.addText(0, "\n\n\n\n"); // Espaço para o serrilhado
            
            printer.print(new com.getnet.posdigital.printer.IPrinterCallback.Stub() {
                @Override public void onSuccess() throws android.os.RemoteException {}
                @Override public void onError(int error) throws android.os.RemoteException {
                    runOnUiThread(() -> Toast.makeText(MainActivity.this, "Erro ao imprimir: " + error, Toast.LENGTH_SHORT).show());
                }
            });
        } catch (Exception e) {
            android.util.Log.e("NAXIO_PRINT", "Erro: " + e.getMessage());
            Toast.makeText(this, "Impressora não disponível ou erro no SDK.", Toast.LENGTH_SHORT).show();
        }
    }
}
