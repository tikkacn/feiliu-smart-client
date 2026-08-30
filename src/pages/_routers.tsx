import { createBrowserRouter, RouteObject } from 'react-router'

import Layout from './_layout'
import { navItems } from './_navigation'

export const router = createBrowserRouter([
  {
    path: '/',
    Component: Layout,
    children: navItems.flatMap((item) =>
      item.Component
        ? [
            {
              path: item.path,
              Component: item.Component,
            } as RouteObject,
          ]
        : [],
    ),
  },
])
