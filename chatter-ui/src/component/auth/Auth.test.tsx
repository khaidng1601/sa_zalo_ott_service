import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Auth from "./Auth";

test("submits registration credentials", async () => {
  const onSubmit = jest.fn().mockResolvedValue(undefined);
  render(
    <Auth mode="register" submitLabel="Đăng ký" onSubmit={onSubmit}>
      <span>Đăng nhập</span>
    </Auth>,
  );

  fireEvent.change(screen.getByLabelText(/Email/), {
    target: { value: "user@example.com" },
  });
  fireEvent.change(screen.getByLabelText(/Tên hiển thị/), {
    target: { value: "Example User" },
  });
  fireEvent.change(screen.getByLabelText(/Mật khẩu/), {
    target: { value: "secure-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Đăng ký" }));

  await waitFor(() => {
    expect(onSubmit).toHaveBeenCalledWith({
      email: "user@example.com",
      displayName: "Example User",
      password: "secure-password",
    });
  });
});

test("shows authentication errors to the user", async () => {
  const onSubmit = jest.fn().mockRejectedValue(new Error("Đăng nhập thất bại"));
  render(
    <Auth mode="login" submitLabel="Đăng nhập" onSubmit={onSubmit}>
      {null}
    </Auth>,
  );

  fireEvent.change(screen.getByLabelText(/Email/), {
    target: { value: "user@example.com" },
  });
  fireEvent.change(screen.getByLabelText(/Mật khẩu/), {
    target: { value: "secure-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Đăng nhập thất bại",
  );
});
