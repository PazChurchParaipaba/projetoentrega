package com.naxio.software;

import android.app.AlertDialog;
import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

public class NaxioUI {

    public static void showSuccessDialog(Context context, String titleText, String messageText) {
        final AlertDialog dialog = new AlertDialog.Builder(context).create();
        
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor("#0f172a")); // Dark Slate
        bg.setCornerRadius(50);
        bg.setStroke(4, Color.parseColor("#10b981")); // Emerald border
        
        LinearLayout layout = new LinearLayout(context);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(80, 80, 80, 80);
        layout.setBackground(bg);
        layout.setGravity(Gravity.CENTER_HORIZONTAL);
        
        TextView icon = new TextView(context);
        icon.setText("✅");
        icon.setTextSize(60);
        icon.setPadding(0, 0, 0, 40);
        layout.addView(icon);
        
        TextView title = new TextView(context);
        title.setText(titleText);
        title.setTextColor(Color.WHITE);
        title.setTextSize(24);
        title.setTypeface(null, Typeface.BOLD);
        title.setGravity(Gravity.CENTER);
        title.setPadding(0, 0, 0, 20);
        layout.addView(title);
        
        TextView message = new TextView(context);
        message.setText(messageText);
        message.setTextColor(Color.parseColor("#94a3b8"));
        message.setTextSize(16);
        message.setGravity(Gravity.CENTER);
        message.setPadding(0, 0, 0, 60);
        layout.addView(message);
        
        GradientDrawable btnBg = new GradientDrawable();
        btnBg.setColor(Color.parseColor("#10b981"));
        btnBg.setCornerRadius(30);
        
        Button btn = new Button(context);
        btn.setText("ENTENDIDO");
        btn.setTextColor(Color.WHITE);
        btn.setTypeface(null, Typeface.BOLD);
        btn.setBackground(btnBg);
        btn.setPadding(60, 30, 60, 30);
        btn.setOnClickListener(v -> dialog.dismiss());
        
        layout.addView(btn);
        
        dialog.setView(layout);
        dialog.getWindow().setBackgroundDrawableResource(android.R.color.transparent);
        dialog.show();
    }

    public static void showErrorDialog(Context context, String titleText, String messageText) {
        showErrorDialog(context, titleText, messageText, null, null);
    }

    public static void showErrorDialog(Context context, String titleText, String messageText, String secondaryBtnText, View.OnClickListener secondaryAction) {
        final AlertDialog dialog = new AlertDialog.Builder(context).create();
        
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor("#0f172a")); // Dark Slate
        bg.setCornerRadius(50);
        bg.setStroke(4, Color.parseColor("#ef4444")); // Red border
        
        LinearLayout layout = new LinearLayout(context);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(80, 80, 80, 80);
        layout.setBackground(bg);
        layout.setGravity(Gravity.CENTER_HORIZONTAL);
        
        TextView icon = new TextView(context);
        icon.setText("⚠️");
        icon.setTextSize(60);
        icon.setPadding(0, 0, 0, 40);
        layout.addView(icon);
        
        TextView title = new TextView(context);
        title.setText(titleText);
        title.setTextColor(Color.WHITE);
        title.setTextSize(24);
        title.setTypeface(null, Typeface.BOLD);
        title.setGravity(Gravity.CENTER);
        title.setPadding(0, 0, 0, 20);
        layout.addView(title);
        
        TextView message = new TextView(context);
        message.setText(messageText);
        message.setTextColor(Color.parseColor("#94a3b8"));
        message.setTextSize(16);
        message.setGravity(Gravity.CENTER);
        message.setPadding(0, 0, 0, 60);
        layout.addView(message);
        
        GradientDrawable btnBg = new GradientDrawable();
        btnBg.setColor(Color.parseColor("#ef4444"));
        btnBg.setCornerRadius(30);
        
        Button btn = new Button(context);
        btn.setText("ENTENDIDO");
        btn.setTextColor(Color.WHITE);
        btn.setTypeface(null, Typeface.BOLD);
        btn.setBackground(btnBg);
        btn.setPadding(60, 30, 60, 30);
        btn.setOnClickListener(v -> dialog.dismiss());
        layout.addView(btn);

        if (secondaryBtnText != null && secondaryAction != null) {
            TextView spacer = new TextView(context);
            spacer.setHeight(20);
            layout.addView(spacer);

            GradientDrawable secBg = new GradientDrawable();
            secBg.setColor(Color.TRANSPARENT);
            secBg.setStroke(2, Color.parseColor("#94a3b8"));
            secBg.setCornerRadius(30);

            Button secBtn = new Button(context);
            secBtn.setText(secondaryBtnText);
            secBtn.setTextColor(Color.parseColor("#94a3b8"));
            secBtn.setBackground(secBg);
            secBtn.setPadding(60, 30, 60, 30);
            secBtn.setOnClickListener(v -> {
                dialog.dismiss();
                secondaryAction.onClick(v);
            });
            layout.addView(secBtn);
        }
        
        dialog.setView(layout);
        dialog.getWindow().setBackgroundDrawableResource(android.R.color.transparent);
        dialog.show();
    }

    public static void alert(Context context, String title, String msg) {
        new AlertDialog.Builder(context)
            .setTitle(title)
            .setMessage(msg)
            .setPositiveButton("OK", null)
            .show();
    }

    public static void showFaleConoscoDialog(Context context) {
        final AlertDialog dialog = new AlertDialog.Builder(context).create();
        
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor("#0f172a")); // Dark Slate
        bg.setCornerRadius(50);
        bg.setStroke(4, Color.parseColor("#3b82f6")); // Blue border
        
        LinearLayout layout = new LinearLayout(context);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(80, 80, 80, 80);
        layout.setBackground(bg);
        layout.setGravity(Gravity.CENTER_HORIZONTAL);
        
        TextView icon = new TextView(context);
        icon.setText("💬");
        icon.setTextSize(60);
        icon.setPadding(0, 0, 0, 40);
        layout.addView(icon);
        
        TextView title = new TextView(context);
        title.setText("FALE CONOSCO");
        title.setTextColor(Color.WHITE);
        title.setTextSize(24);
        title.setTypeface(null, Typeface.BOLD);
        title.setGravity(Gravity.CENTER);
        title.setPadding(0, 0, 0, 20);
        layout.addView(title);
        
        TextView message = new TextView(context);
        message.setText("NAXIO SOFTWARE E AUTOMAÇÃO\n\n" +
                         "Precisa de ajuda ou suporte técnico?\n" +
                         "Nossos canais oficiais de atendimento:\n\n" +
                         "📧 E-mail: naxiosoftware@gmail.com\n" +
                         "💬 WhatsApp: (85) 99181-5434\n" +
                         "⏰ Seg. a Sex. das 08h às 18h\n\n" +
                         "Dúvidas sobre pagamentos Getnet?\n" +
                         "Central Getnet:\n" +
                         "📞 Capitais: 4002-4000\n" +
                         "📞 Demais Regiões: 0800-648-4000");
        message.setTextColor(Color.parseColor("#f1f5f9"));
        message.setTextSize(14);
        message.setGravity(Gravity.LEFT);
        message.setPadding(20, 0, 20, 60);
        layout.addView(message);
        
        GradientDrawable btnBg = new GradientDrawable();
        btnBg.setColor(Color.parseColor("#3b82f6"));
        btnBg.setCornerRadius(30);
        
        Button btn = new Button(context);
        btn.setText("ENTENDIDO");
        btn.setTextColor(Color.WHITE);
        btn.setTypeface(null, Typeface.BOLD);
        btn.setBackground(btnBg);
        btn.setPadding(60, 30, 60, 30);
        btn.setOnClickListener(v -> dialog.dismiss());
        layout.addView(btn);
        
        dialog.setView(layout);
        dialog.getWindow().setBackgroundDrawableResource(android.R.color.transparent);
        dialog.show();
    }
}
