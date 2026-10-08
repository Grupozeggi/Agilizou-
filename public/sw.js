// Service worker do Agilizou: só recebe notificações (sem cache offline).
self.addEventListener("push", (evento) => {
  const dados = evento.data ? evento.data.json() : {};
  evento.waitUntil(
    self.registration.showNotification(dados.title || "Agilizou", {
      body: dados.body || "",
      icon: "/icone-192.png",
      badge: "/icone-192.png",
      data: { url: dados.url || "/app/hoje" },
      lang: "pt-BR",
    }),
  );
});

self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const url = new URL(evento.notification.data?.url || "/app/hoje", self.location.origin).href;
  evento.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
      for (const j of janelas) {
        if (j.url.startsWith(self.location.origin)) {
          j.navigate(url);
          return j.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
