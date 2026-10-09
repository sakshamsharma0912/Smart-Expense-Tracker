# Open your website

1. Extract the **complete ZIP** to a folder.
2. Install a full **JDK 17 or newer** if Java is not already installed.
3. Double-click **run.bat** on Windows. On Mac/Linux open a terminal in the folder and run **sh run.sh**.
4. Your browser opens **http://127.0.0.1:8080**. Keep the Java window open.
5. Choose **Admin login** or **User login**. On the first start, save the new passwords printed as **INITIAL_LOGIN email password** in the Java window. They are generated locally and printed only once.

You can also double-click **index.html** (or the separately supplied **Smart_Expense_Tracker.html**) and use its login links after starting Java. An HTML file opens the website; the Java process runs the server and database.

No database is shipped in this public package. First startup creates four fictional users and three months of tracker records locally. Accounts, passwords and changes persist across restarts. New users can register from the user sign-in form. There is no password recovery feature.

For a phone on the same Wi-Fi, start **run-android-wifi.bat** and use the phone URL printed in its window. Admin and user logins both work on mobile.

If the browser says it cannot connect, start run.bat and leave its window open. If port 8080 is already used, stop the other tracker instance or run Java with `--port=8090` and open http://127.0.0.1:8090.

Your saved database is **data/expense-tracker.mv.db**. Stop Java before copying it for a backup. Keep this file when updating the project.
