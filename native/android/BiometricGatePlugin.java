package __PACKAGE__;

import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.concurrent.Executor;

/** التحقق بالبصمة (أو الوجه) عبر BiometricPrompt الرسمي من AndroidX. */
@CapacitorPlugin(name = "BiometricGate")
public class BiometricGatePlugin extends Plugin {

    private static final int AUTH =
            BiometricManager.Authenticators.BIOMETRIC_STRONG | BiometricManager.Authenticators.BIOMETRIC_WEAK;

    @PluginMethod
    public void isAvailable(PluginCall call) {
        int r = BiometricManager.from(getContext()).canAuthenticate(AUTH);
        JSObject o = new JSObject();
        o.put("available", r == BiometricManager.BIOMETRIC_SUCCESS);
        o.put("code", r);
        call.resolve(o);
    }

    @PluginMethod
    public void authenticate(final PluginCall call) {
        final String title = call.getString("title", "MMY.YE");
        final String subtitle = call.getString("subtitle", "");
        final String cancel = call.getString("cancel", "Cancel");

        if (getActivity() == null) {
            call.reject("no_activity", "0");
            return;
        }

        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    Executor executor = ContextCompat.getMainExecutor(getContext());
                    BiometricPrompt prompt = new BiometricPrompt(
                            (FragmentActivity) getActivity(),
                            executor,
                            new BiometricPrompt.AuthenticationCallback() {
                                @Override
                                public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                                    JSObject o = new JSObject();
                                    o.put("ok", true);
                                    call.resolve(o);
                                }

                                @Override
                                public void onAuthenticationError(int errorCode, @NonNull CharSequence errString) {
                                    call.reject(String.valueOf(errString), String.valueOf(errorCode));
                                }
                            });

                    BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                            .setTitle(title)
                            .setSubtitle(subtitle)
                            .setNegativeButtonText(cancel)
                            .setAllowedAuthenticators(AUTH)
                            .build();
                    prompt.authenticate(info);
                } catch (Exception e) {
                    call.reject(String.valueOf(e.getMessage()), "exception");
                }
            }
        });
    }
}
