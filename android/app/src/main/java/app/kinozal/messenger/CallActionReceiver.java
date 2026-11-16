package app.kinozal.messenger;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

// «Отклонить» прямо в уведомлении о звонке — не открывая Кинозал
public class CallActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        KinozalPlugin.declineFromNotification(context);
    }
}
